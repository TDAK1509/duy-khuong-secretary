import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { openLeakDatabases } from './support/leak-databases.ts';
import { insertEntry, insertPaper, linkEntry } from './support/paper-fixtures.ts';
import { editDataSheet, FIRST_DATA_ROW, findColumn, sendReturnedFile } from './support/returned-export-files.ts';
import { resetDatabase } from './support/reset-database.ts';
import { createToolHarness } from './support/tool-harness.ts';

const databases = openLeakDatabases();

const PAPER_FILTERS = { organization: null, role: null, stage: null, kind: null, plate: '51C12345', date_meaning: null, date_from: '2026-03-01', date_to: '2026-03-31' };
const WAGE_HEADER = 'Lương tài xế';

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test('a returned export with one changed cell stores a review and no paper', async () => {
  const bytes = await exportAlphaPaper();
  const edited = await editDataSheet(bytes, (sheet) => {
    sheet.getRow(FIRST_DATA_ROW).getCell(findColumn(sheet, WAGE_HEADER)).value = 700000;
  });
  const sent = await sendReturnedFile(databases, edited);
  const changes = await databases.owner.query('SELECT c.status FROM company_export_review_changes c JOIN company_export_reviews r ON r.id = c.review_id WHERE r.message_file_id = $1 AND r.status = $2', [sent.fileId, 'pending']);
  const sources = await databases.owner.query('SELECT 1 FROM document_sources WHERE message_id = $1', [sent.messageId]);
  assert.deepEqual([changes.rows.length, sources.rows.length], [1, 0]);
});

async function exportAlphaPaper(): Promise<Uint8Array> {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', parties: [{ role: 'issuer', name: 'Alpha' }] });
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha', wageVnd: 600000 }));
  const harness = createToolHarness(databases.runtime);
  await harness.runTool('chat-gate', 'export_documents_xlsx', PAPER_FILTERS);
  return harness.storage.listStoredFiles()[0]!.bytes;
}
