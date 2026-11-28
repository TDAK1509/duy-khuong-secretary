import ExcelJS from 'exceljs';
import { HEADER_ROW } from '../../../src/app/documents/format-workbook-sheet.ts';
import { HeldFiles } from '../../../src/app/sheet-files/held-files.ts';
import { runParseFilesStep } from '../../../src/app/intake/run-parse-files-step.ts';
import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { ExcelJsSheetParser } from '../../../src/providers/sheets/exceljs-sheet-parser.ts';
import { FakeFileStorage } from './fake-file-storage.ts';
import { loadWorkbook } from './read-marked-sheet.ts';
import { A_ADMIN_USER_ID, FIXED_NOW, WORKSPACE_A_ID } from './seed-ids.ts';

const RETURNED_EVENT_ID = 'aaaaaaaa-0019-4000-8000-0000000000a1';
const RETURNED_MESSAGE_ID = 'aaaaaaaa-0020-4000-8000-0000000000a1';
const RETURNED_FILE_ID = 'aaaaaaaa-0022-4000-8000-0000000000a1';
const RETURNED_FILE_KEY = 'leak-test/returned-export.xlsx';
export { HEADER_ROW };

export const FIRST_DATA_ROW = HEADER_ROW + 1;

export type SentFile = { fileId: string; messageId: string };

export async function sendReturnedFile(databases: { owner: PostgresPool; runtime: PostgresPool }, bytes: Uint8Array): Promise<SentFile> {
  await insertFileMessage(databases.owner);
  const storage = new FakeFileStorage();
  await storage.put(RETURNED_FILE_KEY, bytes);
  const outcome = await runParseFilesStep({ database: databases.runtime, clock: { now: () => FIXED_NOW }, maxTextLength: 2000, fileStorage: storage, sheetParser: new ExcelJsSheetParser(), held: new HeldFiles() });
  if (outcome !== 'processed') throw new Error('the parse step found no file to parse');
  return { fileId: RETURNED_FILE_ID, messageId: RETURNED_MESSAGE_ID };
}

async function insertFileMessage(owner: PostgresPool): Promise<void> {
  await owner.query(
    `INSERT INTO inbound_events (id, channel, account_id, external_event_id, external_user_id, kind, payload, status, processed_at)
     VALUES ($1, 'zalo-oa', 'seed-oa', 'RETURNED-EVENT', 'seed-zalo-admin-a', 'file', '{}', 'done', now())`,
    [RETURNED_EVENT_ID],
  );
  await owner.query(
    `INSERT INTO messages (id, workspace_id, user_id, author, text, inbound_event_id, event_part, submission_status)
     VALUES ($1, $2, $3, 'user', 'returned-export.xlsx', $4, 0, 'accepted')`,
    [RETURNED_MESSAGE_ID, WORKSPACE_A_ID, A_ADMIN_USER_ID, RETURNED_EVENT_ID],
  );
  await owner.query('UPDATE message_files SET parsed_at = now(), processed_at = now()');
  await owner.query(
    `INSERT INTO message_files (id, workspace_id, message_id, file_key, file_name, file_size_bytes, extension)
     VALUES ($1, $2, $3, $4, 'returned-export.xlsx', 1024, 'xlsx')`,
    [RETURNED_FILE_ID, WORKSPACE_A_ID, RETURNED_MESSAGE_ID, RETURNED_FILE_KEY],
  );
}

export async function listReplyTexts(owner: PostgresPool): Promise<string[]> {
  const { rows } = await owner.query<{ body: string }>(`SELECT body FROM outbound_messages WHERE external_user_id = 'seed-zalo-admin-a' AND body <> 'SAFE-A-OUTBOUND' ORDER BY seq`);
  return rows.map((row) => row.body);
}

export type SheetEdit = (sheet: ExcelJS.Worksheet) => void;

export async function editDataSheet(bytes: Uint8Array, edit: SheetEdit): Promise<Uint8Array> {
  const workbook = await loadWorkbook(bytes);
  edit(workbook.worksheets[0]!);
  return new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
}

export function findColumn(sheet: ExcelJS.Worksheet, header: string): number {
  for (let column = 1; column <= sheet.columnCount; column += 1) if (sheet.getRow(HEADER_ROW).getCell(column).value === header) return column;
  throw new Error(`the sheet has no column "${header}"`);
}

export async function buildPlainSheet(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Data');
  sheet.addRow(['Plate', 'Weight']);
  sheet.addRow(['51C12345', 27000]);
  return new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
}

export async function countNewReviews(owner: PostgresPool): Promise<number> {
  const { rows } = await owner.query('SELECT 1 FROM company_export_reviews WHERE id <> ALL($1::uuid[])', [SEEDED_REVIEW_IDS]);
  return rows.length;
}

const SEEDED_REVIEW_IDS = ['aaaaaaaa-0049-4000-8000-000000000001', 'bbbbbbbb-0049-4000-8000-000000000001'];
