import type { ReaderService } from '../../services/reading/reader-service.ts';
import type { Clock } from '../../services/clock/clock.ts';
import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import type { SheetParser } from '../../services/sheets/sheet-parser.ts';
import type { FileStorage, SheetExtension } from '../../services/storage/file-storage.ts';
import { hasCredits } from '../credits/has-credits.ts';
import { meterReader } from '../credits/meter-reader.ts';
import { insertDocument } from '../documents/insert-document.ts';
import type { DocumentDraft } from '../documents/document-draft.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { OUT_OF_CREDIT_TEXT } from './intake-texts.ts';
import { mapRowToDraft, planSheetMapping, type MappingProblem } from './map-sheet-rows.ts';
import { parseSheet } from './parse-sheet.ts';
import { readSheet, type SheetReadOutcome } from './read-sheet.ts';
import {
  formatSavedAndSkipped,
  SHEET_CAPTION_USED_TEXT,
  SHEET_MISSING_DATE_COLUMN_TEXT,
  SHEET_MISSING_TITLE_COLUMN_TEXT,
  SHEET_READER_FAILURE_TEXT,
} from './sheet-texts.ts';
import type { SheetMappingPlan } from './map-sheet-rows.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';

const MAX_PREVIEW_ROWS = 10;

export type ProcessFilesDependencies = {
  database: Database;
  clock: Clock;
  channel: MessagingChannel;
  reader: ReaderService;
  fileStorage: FileStorage;
  sheetParser: SheetParser;
};

type ReadyFile = {
  fileId: string;
  fileKey: string;
  fileName: string;
  extension: SheetExtension;
  workspaceId: string;
  messageId: string;
  caption: string | null;
};

type ReadyFileWithRows = ReadyFile & { headers: string[]; rows: string[][] };

type FileRecipient = {
  channel: string;
  accountId: string;
  externalUserId: string;
  membershipId: string;
};

type OutboundReply = { text: string };

export async function runProcessFilesStep(dependencies: ProcessFilesDependencies): Promise<'processed' | 'idle'> {
  const file = await findNextReadyFile(dependencies.database);
  if (file === null) return 'idle';
  const parsed = await readParsedRows(dependencies, file);
  const reply = await processFile(dependencies, parsed);
  await writeProcessingResult(dependencies, file, reply);
  return 'processed';
}

async function findNextReadyFile(database: Database): Promise<ReadyFile | null> {
  const { rows } = await database.query<ReadyFile>(READY_FILE_QUERY);
  return rows[0] ?? null;
}

const READY_FILE_QUERY = `
  SELECT id AS "fileId",
         file_key AS "fileKey",
         file_name AS "fileName",
         extension,
         workspace_id AS "workspaceId",
         message_id AS "messageId",
         caption
  FROM message_files
  WHERE parsed_at IS NOT NULL AND processed_at IS NULL
  ORDER BY created_at
  LIMIT 1
`;

async function readParsedRows(dependencies: ProcessFilesDependencies, file: ReadyFile): Promise<ReadyFileWithRows> {
  const bytes = await dependencies.fileStorage.get(file.fileKey);
  if (bytes === null) return { ...file, headers: [], rows: [] };
  const parsed = await parseSheet(file.extension, bytes, dependencies.sheetParser);
  if (!parsed.ok) return { ...file, headers: [], rows: [] };
  return { ...file, headers: parsed.headers, rows: parsed.rows };
}

async function processFile(dependencies: ProcessFilesDependencies, file: ReadyFileWithRows): Promise<OutboundReply> {
  if (!(await hasCredits(dependencies.database, file.workspaceId))) return { text: OUT_OF_CREDIT_TEXT };
  const outcome = await callSheetReader(dependencies, file);
  if (!outcome.ok) return { text: SHEET_READER_FAILURE_TEXT };
  const mapping = planSheetMapping(file.headers, outcome.reading);
  if (!mapping.ok) return { text: textForMappingProblem(mapping.problem) };
  return applyMappingToRows(dependencies, file, mapping.plan);
}

function textForMappingProblem(problem: MappingProblem): string {
  if (problem === 'missing_date') return SHEET_MISSING_DATE_COLUMN_TEXT;
  return SHEET_MISSING_TITLE_COLUMN_TEXT;
}

async function callSheetReader(dependencies: ProcessFilesDependencies, file: ReadyFileWithRows): Promise<SheetReadOutcome> {
  const meter = { database: dependencies.database, workspaceId: file.workspaceId, charged: { clock: dependencies.clock, maxTextLength: dependencies.channel.maxTextLength } };
  const metered = meterReader(dependencies.reader, meter, () => 'text_read');
  return readSheet(metered, { fileName: file.fileName, caption: file.caption, headers: file.headers, dataRows: file.rows.slice(0, MAX_PREVIEW_ROWS) });
}

async function applyMappingToRows(dependencies: ProcessFilesDependencies, file: ReadyFileWithRows, plan: SheetMappingPlan): Promise<OutboundReply> {
  const attempts = file.rows.map((row, index) => mapRowToDraft(plan, row, file.headers, index + 1));
  const saved = attempts.flatMap((attempt) => (attempt.ok ? [attempt] : []));
  const skipped = attempts.flatMap((attempt) => (attempt.ok ? [] : [attempt.rowNumber]));
  await saveDrafts(dependencies, file, saved.map((attempt) => attempt.draft));
  const text = formatSavedAndSkipped(saved.length, file.rows.length, plan.kind, skipped);
  return { text: file.caption === null ? text : `${SHEET_CAPTION_USED_TEXT} ${text}` };
}

async function saveDrafts(dependencies: ProcessFilesDependencies, file: ReadyFileWithRows, drafts: DocumentDraft[]): Promise<void> {
  if (drafts.length === 0) return;
  await runInTransaction(dependencies.database, (transaction) =>
    transaction.withScope({ workspaceId: file.workspaceId }, async () => {
      await lockWorkspaceRecords(transaction, file.workspaceId);
      for (const draft of drafts) {
        await insertDocument(transaction, { id: file.messageId, workspaceId: file.workspaceId }, draft);
      }
    }),
  );
}

async function writeProcessingResult(dependencies: ProcessFilesDependencies, file: ReadyFile, reply: OutboundReply): Promise<void> {
  const now = dependencies.clock.now();
  await runInTransaction(dependencies.database, (transaction) =>
    transaction.withScope({ workspaceId: file.workspaceId }, () => finishProcessingInScope(transaction, dependencies, file, reply, now)),
  );
}

async function finishProcessingInScope(transaction: Transaction, dependencies: ProcessFilesDependencies, file: ReadyFile, reply: OutboundReply, now: Date): Promise<void> {
  const recipient = await findRecipient(transaction, file);
  await enqueueText(transaction, {
    to: { channel: recipient.channel, accountId: recipient.accountId, externalUserId: recipient.externalUserId },
    text: reply.text,
    maxTextLength: dependencies.channel.maxTextLength,
    availableAt: now,
    adminMembershipId: recipient.membershipId,
  });
  await transaction.query('UPDATE message_files SET processed_at = $1 WHERE id = $2', [now, file.fileId]);
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

async function findRecipient(transaction: Transaction, file: ReadyFile): Promise<FileRecipient> {
  const [row] = await transaction.query<FileRecipient>(RECIPIENT_QUERY, [file.messageId]);
  if (!row) throw new Error(`process step cannot find recipient for file ${file.fileId}`);
  return row;
}
