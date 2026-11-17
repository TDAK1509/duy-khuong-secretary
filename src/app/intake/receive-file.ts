import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { FileStorage, SheetExtension } from '../../services/storage/file-storage.ts';
import { toDatabaseScope } from '../access/to-database-scope.ts';
import { scopeDatabase } from '../db/scoped-database.ts';
import type { Transaction } from '../db/transaction.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import type { ClaimedEvent } from '../processing/claimed-event.ts';
import type { Finished, NotConfigured, Stages } from '../processing/stages.ts';
import { recordSenderIdentity } from '../processing/record-sender-identity.ts';
import { detectSheetType } from './detect-sheet-type.ts';
import type { IntakeDependencies } from './intake-context.ts';
import type { IntakeSender } from './find-intake-sender.ts';
import {
  formatSheetReceipt,
  SHEET_OVERSIZED_TEXT,
  SHEET_TOO_MANY_FILES_TEXT,
  SHEET_WRONG_EXTENSION_TEXT,
} from './sheet-texts.ts';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FILE_NAME_LIMIT = 200;

export type ReceivedFile = { fileUrl: string; fileName: string; fileSize: number };

const filePayloadSchema = z.union([
  z.object({ too_many: z.literal(true) }),
  z.object({ file_url: z.string(), file_name: z.string(), file_size: z.number().int().nonnegative() }),
]);

export function readFileFromPayload(event: ClaimedEvent): ReceivedFile | 'too_many' {
  const payload = filePayloadSchema.parse(event.payload);
  if ('too_many' in payload) return 'too_many';
  return { fileUrl: payload.file_url, fileName: payload.file_name, fileSize: payload.file_size };
}

export async function receiveFile(
  dependencies: IntakeDependencies,
  stages: Stages,
  event: ClaimedEvent,
  sender: IntakeSender,
  file: ReceivedFile | 'too_many',
): Promise<Finished | NotConfigured> {
  if (file === 'too_many') return refuseFileEvent(dependencies, stages, event, SHEET_TOO_MANY_FILES_TEXT);
  if (file.fileSize > MAX_FILE_BYTES) return refuseFileEvent(dependencies, stages, event, SHEET_OVERSIZED_TEXT);
  if (!dependencies.fileStorage) return { kind: 'not_configured', group: 'files' };
  return downloadAndStore(dependencies, stages, event, sender, file);
}

async function downloadAndStore(
  dependencies: IntakeDependencies,
  stages: Stages,
  event: ClaimedEvent,
  sender: IntakeSender,
  file: ReceivedFile,
): Promise<Finished> {
  const download = await dependencies.channel.downloadAttachment(file.fileUrl, MAX_FILE_BYTES);
  if (!download.ok) return refuseFileEvent(dependencies, stages, event, reasonToText(download.reason));
  const extension = detectSheetType(file.fileName, download.bytes);
  if (extension === null) return refuseFileEvent(dependencies, stages, event, SHEET_WRONG_EXTENSION_TEXT);
  return storeAcceptedFile(dependencies, stages, event, sender, file, download.bytes, extension);
}

function reasonToText(reason: 'too_large' | 'unavailable'): string {
  return reason === 'too_large' ? SHEET_OVERSIZED_TEXT : SHEET_WRONG_EXTENSION_TEXT;
}

async function storeAcceptedFile(
  dependencies: IntakeDependencies,
  stages: Stages,
  event: ClaimedEvent,
  sender: IntakeSender,
  file: ReceivedFile,
  bytes: Uint8Array,
  extension: SheetExtension,
): Promise<Finished> {
  const scope = toDatabaseScope(sender);
  const scopedStages = stages.forScope(scope);
  const stored = await runStoreFileStage(scopedStages, event, sender, file, extension);
  await requireFileStorage(dependencies).put(stored.fileKey, { bytes, extension });
  return scopedStages.finishEvent((transaction) => finishFileIntake(transaction, dependencies, event, sender, file));
}

type StoredFileRow = { id: string; fileKey: string };

async function runStoreFileStage(
  stages: Stages,
  event: ClaimedEvent,
  sender: IntakeSender,
  file: ReceivedFile,
  extension: SheetExtension,
): Promise<StoredFileRow> {
  const messageId = randomUUID();
  const fileKey = `${sender.workspaceId}/${messageId}.${extension}`;
  await stages.runStage({
    isDone: (transaction) => hasStoredFileFor(transaction, event),
    write: (transaction) => storeFileMessage(transaction, event, sender, { messageId, fileKey, file, extension }),
  });
  return { id: messageId, fileKey };
}

async function hasStoredFileFor(transaction: Transaction, event: ClaimedEvent): Promise<boolean> {
  const rows = await transaction.query(
    'SELECT 1 FROM messages WHERE inbound_event_id = $1 AND event_part = 0',
    [event.id],
  );
  return rows.length > 0;
}

type FileInsert = { messageId: string; fileKey: string; file: ReceivedFile; extension: SheetExtension };

async function storeFileMessage(
  transaction: Transaction,
  event: ClaimedEvent,
  sender: IntakeSender,
  insert: FileInsert,
): Promise<void> {
  const name = trimFileName(insert.file.fileName);
  await transaction.query(
    `INSERT INTO messages (id, workspace_id, user_id, author, text, inbound_event_id, event_part)
     VALUES ($1, $2, $3, 'user', $4, $5, 0)
     ON CONFLICT (inbound_event_id, event_part) DO NOTHING`,
    [insert.messageId, sender.workspaceId, sender.userId, name, event.id],
  );
  await transaction.query(
    `INSERT INTO message_files (message_id, workspace_id, file_key, file_name, file_size_bytes, extension)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (message_id) DO NOTHING`,
    [insert.messageId, sender.workspaceId, insert.fileKey, name, insert.file.fileSize, insert.extension],
  );
}

function trimFileName(name: string): string {
  return name.trim().slice(0, FILE_NAME_LIMIT);
}

async function finishFileIntake(
  transaction: Transaction,
  dependencies: IntakeDependencies,
  event: ClaimedEvent,
  sender: IntakeSender,
  file: ReceivedFile,
): Promise<void> {
  await recordSenderIdentity(transaction, event);
  await enqueueText(transaction, {
    to: { channel: event.channel, accountId: event.accountId, externalUserId: event.externalUserId },
    text: formatSheetReceipt(trimFileName(file.fileName), file.fileSize),
    maxTextLength: dependencies.channel.maxTextLength,
    availableAt: dependencies.clock.now(),
    adminMembershipId: sender.membershipId,
  });
}

async function refuseFileEvent(
  dependencies: IntakeDependencies,
  stages: Stages,
  event: ClaimedEvent,
  text: string,
): Promise<Finished> {
  return stages.finishEvent(async (transaction) => {
    await recordSenderIdentity(transaction, event);
    await enqueueText(transaction, {
      to: { channel: event.channel, accountId: event.accountId, externalUserId: event.externalUserId },
      text,
      maxTextLength: dependencies.channel.maxTextLength,
      availableAt: dependencies.clock.now(),
    });
  });
}

function requireFileStorage(dependencies: IntakeDependencies): FileStorage {
  const { fileStorage } = dependencies;
  if (!fileStorage) throw new Error('file storage is not configured');
  return fileStorage;
}
