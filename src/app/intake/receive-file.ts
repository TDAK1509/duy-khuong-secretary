import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { DownloadFailure } from '../../services/messaging/messaging-channel.ts';
import type { FileStorage, SheetExtension } from '../../services/storage/file-storage.ts';
import { toDatabaseScope } from '../access/to-database-scope.ts';
import { scopeDatabase } from '../db/scoped-database.ts';
import type { Database, Transaction } from '../db/transaction.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import type { ClaimedEvent } from '../processing/claimed-event.ts';
import type { Finished, NotConfigured, Stages } from '../processing/stages.ts';
import { recordSenderIdentity } from '../processing/record-sender-identity.ts';
import { detectSheetType } from './detect-sheet-type.ts';
import { findFileCaption } from './link-caption.ts';
import type { IntakeDependencies } from './intake-context.ts';
import type { IntakeSender } from './find-intake-sender.ts';
import { formatSheetReceipt, SHEET_NOT_DOWNLOADED_TEXT, SHEET_NOT_READABLE_TEXT, SHEET_OVERSIZED_TEXT, SHEET_TOO_MANY_FILES_TEXT } from './sheet-texts.ts';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FILE_NAME_LIMIT = 200;
const MAX_CAPTION_LENGTH = 1000;

export type SingleFile = { kind: 'one'; fileUrl: string; fileName: string; fileSize: number };

export type ReceivedFile = SingleFile | { kind: 'too_many' };

const filePayloadSchema = z.union([
  z.object({ too_many: z.literal(true) }),
  z.object({ file_url: z.string(), file_name: z.string(), file_size: z.number().int().nonnegative() }),
]);

export function readFileFromPayload(event: ClaimedEvent): ReceivedFile {
  const payload = filePayloadSchema.parse(event.payload);
  if ('too_many' in payload) return { kind: 'too_many' };
  return { kind: 'one', fileUrl: payload.file_url, fileName: payload.file_name, fileSize: payload.file_size };
}

export async function receiveFile(
  dependencies: IntakeDependencies,
  stages: Stages,
  event: ClaimedEvent,
  sender: IntakeSender,
  file: ReceivedFile,
): Promise<Finished | NotConfigured> {
  if (file.kind === 'too_many') return refuseFileEvent(dependencies, stages, event, SHEET_TOO_MANY_FILES_TEXT);
  if (file.fileSize > MAX_FILE_BYTES) return refuseFileEvent(dependencies, stages, event, SHEET_OVERSIZED_TEXT);
  if (!dependencies.fileStorage) return { kind: 'not_configured', group: 'files' };
  return downloadAndStore(dependencies, stages, event, sender, file);
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

async function downloadAndStore(
  dependencies: IntakeDependencies,
  stages: Stages,
  event: ClaimedEvent,
  sender: IntakeSender,
  file: SingleFile,
): Promise<Finished> {
  const download = await dependencies.channel.downloadAttachment(file.fileUrl, MAX_FILE_BYTES);
  if (!download.ok) return handleDownloadFailure(dependencies, stages, event, download.reason);
  const extension = detectSheetType(file.fileName, download.bytes);
  if (extension === null) return refuseNonSheet(dependencies, stages, event);
  return storeAcceptedFile(dependencies, stages, event, sender, file, download.bytes, extension);
}

function handleDownloadFailure(
  dependencies: IntakeDependencies,
  stages: Stages,
  event: ClaimedEvent,
  reason: DownloadFailure,
): Promise<Finished> {
  if (reason === 'too_large') return refuseFileEvent(dependencies, stages, event, SHEET_OVERSIZED_TEXT);
  console.error(`[intake] file download failed: ${reason}`);
  return refuseFileEvent(dependencies, stages, event, SHEET_NOT_DOWNLOADED_TEXT);
}

function refuseNonSheet(dependencies: IntakeDependencies, stages: Stages, event: ClaimedEvent): Promise<Finished> {
  console.error(`[intake] file is not a sheet: ${event.id}`);
  return refuseFileEvent(dependencies, stages, event, SHEET_NOT_READABLE_TEXT);
}

async function storeAcceptedFile(
  dependencies: IntakeDependencies,
  stages: Stages,
  event: ClaimedEvent,
  sender: IntakeSender,
  file: SingleFile,
  bytes: Uint8Array,
  extension: SheetExtension,
): Promise<Finished> {
  const scope = toDatabaseScope(sender);
  const scopedStages = stages.forScope(scope);
  const target = await chooseFileTarget(scopeDatabase(dependencies.database, scope), event, sender, extension);
  await requireFileStorage(dependencies).put(target.fileKey, bytes, contentTypeFor(extension));
  await runStoreFileStage(scopedStages, event, sender, { ...target, file, extension });
  return scopedStages.finishEvent((transaction) => finishFileIntake(transaction, dependencies, event, sender, file));
}

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function contentTypeFor(extension: SheetExtension): string {
  return extension === 'csv' ? 'text/csv' : XLSX_CONTENT_TYPE;
}

function requireFileStorage(dependencies: IntakeDependencies): FileStorage {
  const { fileStorage } = dependencies;
  if (!fileStorage) throw new Error('file storage is not configured');
  return fileStorage;
}

type FileTarget = { messageId: string; fileKey: string };

const FIND_STORED_FILE_SQL = `
  SELECT file.message_id, file.file_key FROM messages message
  JOIN message_files file ON file.message_id = message.id
  WHERE message.inbound_event_id = $1 AND message.event_part = 0`;

async function chooseFileTarget(database: Database, event: ClaimedEvent, sender: IntakeSender, extension: SheetExtension): Promise<FileTarget> {
  const { rows: [stored] } = await database.query<{ message_id: string; file_key: string }>(FIND_STORED_FILE_SQL, [event.id]);
  if (stored !== undefined) return { messageId: stored.message_id, fileKey: stored.file_key };
  const messageId = randomUUID();
  return { messageId, fileKey: `${sender.workspaceId}/${messageId}.${extension}` };
}

async function runStoreFileStage(stages: Stages, event: ClaimedEvent, sender: IntakeSender, insert: FileInsert): Promise<void> {
  await stages.runStage({
    isDone: (transaction) => hasStoredFileFor(transaction, event),
    write: (transaction) => storeFileMessage(transaction, event, sender, insert),
  });
}

async function hasStoredFileFor(transaction: Transaction, event: ClaimedEvent): Promise<boolean> {
  const rows = await transaction.query(
    'SELECT 1 FROM messages WHERE inbound_event_id = $1 AND event_part = 0',
    [event.id],
  );
  return rows.length > 0;
}

type FileInsert = { messageId: string; fileKey: string; file: SingleFile; extension: SheetExtension };

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
  const caption = await findFileCaption(transaction, event.id, MAX_CAPTION_LENGTH);
  await transaction.query(
    `INSERT INTO message_files (message_id, workspace_id, file_key, file_name, file_size_bytes, extension, caption)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (message_id) DO NOTHING`,
    [insert.messageId, sender.workspaceId, insert.fileKey, name, insert.file.fileSize, insert.extension, caption],
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
  file: SingleFile,
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
