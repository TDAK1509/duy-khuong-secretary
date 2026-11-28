import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { NO_CHANGE_TEXT, STRUCTURE_CHANGED_TEXT } from '../../src/app/export-reviews/export-review-texts.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { buildPlainSheet, countNewReviews, editDataSheet, FIRST_DATA_ROW, findColumn, HEADER_ROW, listReplyTexts, sendReturnedFile } from './support/returned-export-files.ts';
import { exportAlphaPapers, pointMarkAtExport, reverseThreeDataRows, swapCustomerAndWageColumns, WAGE_HEADER } from './support/returned-export-fixtures.ts';
import { resetDatabase } from './support/reset-database.ts';
import { B_EXPORT_ID } from './support/seed-ids.ts';

const databases = openLeakDatabases();

const ANOTHER_EXPORT_ROW_ID = 'aaaaaaaa-0048-4000-8000-000000000001';

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test('a returned export with one changed cell stores a review and no paper', async () => {
  const bytes = await exportAlphaPapers(databases);
  const edited = await editDataSheet(bytes, (sheet) => {
    sheet.getRow(FIRST_DATA_ROW).getCell(findColumn(sheet, WAGE_HEADER)).value = 700000;
  });
  const sent = await sendReturnedFile(databases, edited);
  const changes = await databases.owner.query('SELECT c.status FROM company_export_review_changes c JOIN company_export_reviews r ON r.id = c.review_id WHERE r.message_file_id = $1 AND r.status = $2', [sent.fileId, 'pending']);
  const sources = await databases.owner.query('SELECT 1 FROM document_sources WHERE message_id = $1', [sent.messageId]);
  assert.deepEqual([changes.rows.length, sources.rows.length], [1, 0]);
});

test('an unchanged returned export gets the no change reply', async () => {
  await sendReturnedFile(databases, await exportAlphaPapers(databases));
  assert.deepEqual(await listReplyTexts(databases.owner), [NO_CHANGE_TEXT]);
});

test('a file with no mark sheet goes through normal sheet intake', async () => {
  await sendReturnedFile(databases, await buildPlainSheet());
  assert.match((await listReplyTexts(databases.owner))[0]!, /có 1 dòng dữ liệu/);
  assert.equal(await countNewReviews(databases.owner), 0);
});

test('a file that names the export of another workspace goes through normal sheet intake', async () => {
  await sendReturnedFile(databases, await pointMarkAtExport(await exportAlphaPapers(databases), B_EXPORT_ID));
  const [reply] = await listReplyTexts(databases.owner);
  assert.match(reply!, /có \d+ dòng dữ liệu/);
  assert.equal(reply!.includes('LEAK-B'), false);
  assert.equal(await countNewReviews(databases.owner), 0);
});

test('a row id of another export is turned away as a structure change', async () => {
  const bytes = await exportAlphaPapers(databases, { count: 2 });
  await sendReturnedFile(databases, await editDataSheet(bytes, (sheet) => {
    sheet.getRow(FIRST_DATA_ROW).getCell(sheet.columnCount).value = ANOTHER_EXPORT_ROW_ID;
  }));
  assert.deepEqual(await listReplyTexts(databases.owner), [STRUCTURE_CHANGED_TEXT]);
  assert.equal(await countNewReviews(databases.owner), 0);
});

test('a deleted row is turned away as a structure change', async () => {
  const bytes = await exportAlphaPapers(databases, { count: 2 });
  await sendReturnedFile(databases, await editDataSheet(bytes, (sheet) => sheet.spliceRows(FIRST_DATA_ROW + 1, 1)));
  assert.deepEqual(await listReplyTexts(databases.owner), [STRUCTURE_CHANGED_TEXT]);
});

test('an added row is turned away as a structure change', async () => {
  const bytes = await exportAlphaPapers(databases, { count: 2 });
  await sendReturnedFile(databases, await editDataSheet(bytes, (sheet) => {
    sheet.getRow(FIRST_DATA_ROW + 3).getCell(findColumn(sheet, 'Biển số')).value = 'extra row';
  }));
  assert.deepEqual(await listReplyTexts(databases.owner), [STRUCTURE_CHANGED_TEXT]);
});

test('a renamed column is turned away as a structure change', async () => {
  const bytes = await exportAlphaPapers(databases);
  await sendReturnedFile(databases, await editDataSheet(bytes, (sheet) => {
    sheet.getRow(HEADER_ROW).getCell(findColumn(sheet, WAGE_HEADER)).value = 'Lương';
  }));
  assert.deepEqual(await listReplyTexts(databases.owner), [STRUCTURE_CHANGED_TEXT]);
});

test('a moved column is turned away as a structure change', async () => {
  const bytes = await exportAlphaPapers(databases, { customer: 'Gamma' });
  await sendReturnedFile(databases, await editDataSheet(bytes, swapCustomerAndWageColumns));
  assert.deepEqual(await listReplyTexts(databases.owner), [STRUCTURE_CHANGED_TEXT]);
});

test('sorted rows are not a structural change', async () => {
  const bytes = await exportAlphaPapers(databases, { count: 3 });
  await sendReturnedFile(databases, await editDataSheet(bytes, reverseThreeDataRows));
  assert.deepEqual(await listReplyTexts(databases.owner), [NO_CHANGE_TEXT]);
});
