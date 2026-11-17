import type { Clock } from '../../services/clock/clock.ts';
import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import type { SheetParser } from '../../services/sheets/sheet-parser.ts';
import type { FileStorage, SheetExtension } from '../../services/storage/file-storage.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { parseSheet, type ParsedSheet } from './parse-sheet.ts';
import { formatHeadersFound, formatNoDataRows, formatParseFailure } from './sheet-texts.ts';

export type ParseFilesDependencies = {
  database: Database;
  clock: Clock;
  channel: MessagingChannel;
  fileStorage: FileStorage;
  sheetParser: SheetParser;
};

type UnparsedFile = {
  fileId: string;
  fileKey: string;
  fileName: string;
  extension: SheetExtension;
  workspaceId: string;
  messageId: string;
};

type FileRecipient = {
  channel: string;
  accountId: string;
  externalUserId: string;
  membershipId: string;
};

export async function runParseFilesStep(dependencies: ParseFilesDependencies): Promise<'processed' | 'idle'> {
  const file = await findNextUnparsedFile(dependencies.database);
  if (file === null) return 'idle';
  const parsed = await readAndParse(dependencies, file);
  await writeParseResult(dependencies, file, parsed);
  return 'processed';
}

async function findNextUnparsedFile(database: Database): Promise<UnparsedFile | null> {
  const { rows } = await database.query<UnparsedFile>(UNPARSED_FILE_QUERY);
  return rows[0] ?? null;
}

const UNPARSED_FILE_QUERY = `
  SELECT id AS "fileId",
         file_key AS "fileKey",
         file_name AS "fileName",
         extension,
         workspace_id AS "workspaceId",
         message_id AS "messageId"
  FROM message_files
  WHERE parsed_at IS NULL
  ORDER BY created_at
  LIMIT 1
`;

async function readAndParse(dependencies: ParseFilesDependencies, file: UnparsedFile): Promise<ParsedSheet> {
  const bytes = await dependencies.fileStorage.get(file.fileKey);
  if (bytes === null) return { ok: false };
  return parseSheet(file.extension, bytes, dependencies.sheetParser);
}

async function writeParseResult(
  dependencies: ParseFilesDependencies,
  file: UnparsedFile,
  parsed: ParsedSheet,
): Promise<void> {
  const text = buildParseReplyText(file.fileName, parsed);
  const now = dependencies.clock.now();
  await runInTransaction(dependencies.database, (transaction) =>
    transaction.withScope({ workspaceId: file.workspaceId }, () =>
      finishParseInScope(transaction, dependencies, file, text, now),
    ),
  );
}

function buildParseReplyText(fileName: string, parsed: ParsedSheet): string {
  if (!parsed.ok) return formatParseFailure(fileName);
  if (parsed.rows.length === 0) return formatNoDataRows(fileName);
  return formatHeadersFound(fileName, parsed.rows.length, parsed.headers);
}

async function finishParseInScope(
  transaction: Transaction,
  dependencies: ParseFilesDependencies,
  file: UnparsedFile,
  text: string,
  now: Date,
): Promise<void> {
  const recipient = await findRecipient(transaction, file);
  await enqueueText(transaction, {
    to: { channel: recipient.channel, accountId: recipient.accountId, externalUserId: recipient.externalUserId },
    text,
    maxTextLength: dependencies.channel.maxTextLength,
    availableAt: now,
    adminMembershipId: recipient.membershipId,
  });
  await transaction.query('UPDATE message_files SET parsed_at = $1 WHERE id = $2', [now, file.fileId]);
}

const RECIPIENT_QUERY = `
  SELECT ie.channel,
         ie.account_id AS "accountId",
         ie.external_user_id AS "externalUserId",
         mem.id AS "membershipId"
  FROM messages m
  JOIN inbound_events ie ON ie.id = m.inbound_event_id
  JOIN memberships mem ON mem.user_id = m.user_id AND mem.workspace_id = m.workspace_id
  WHERE m.id = $1
`;

async function findRecipient(transaction: Transaction, file: UnparsedFile): Promise<FileRecipient> {
  const [row] = await transaction.query<FileRecipient>(RECIPIENT_QUERY, [file.messageId]);
  if (!row) throw new Error(`parse step cannot find recipient for file ${file.fileId}`);
  return row;
}
