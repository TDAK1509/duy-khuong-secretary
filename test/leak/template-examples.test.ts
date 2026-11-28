import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { cleanupOldPhotos } from '../../src/app/intake/cleanup-old-photos.ts';
import { validateReading } from '../../src/app/reading/reading.ts';
import { callChatTool } from './support/call-chat-tool.ts';
import { insertExamplePaper } from './support/insert-example-paper.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { MemoryPhotoStorage } from './support/memory-photo-storage.ts';
import { resetDatabase } from './support/reset-database.ts';
import { FIXED_NOW } from './support/seed-ids.ts';
import { createToolHarness } from './support/tool-harness.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test('saving a template stores an example whose reading fits the reader item schema', async () => {
  const paperId = await insertExamplePaper(databases.owner, { imageKey: 'example/one.jpg' });
  const result = JSON.parse(await saveTemplate([paperId]));
  assert.equal(result.ok, true);
  const [example] = await listStoredExamples();
  assert.equal(example?.image_key, 'example/one.jpg');
  const reading = validateReading({ has_work_data: true, needs_explanation: false, has_question: false, photo_problem: null, items: [example?.expected_reading] });
  assert.equal(reading.ok, true);
});

test('the snapshot keeps parties, number and date details, and null fields', async () => {
  const lines = [
    { label: 'Trọng lượng hàng', value: '27080 kg', meaning: 'Trọng lượng hàng', number: 27080, unit: 'kg', at: null },
    { label: 'Thời điểm cân lần 1', value: '01/03/2026 08:15:00', meaning: 'Thời điểm cân lần 1', number: null, unit: null, at: '2026-03-01T08:15:00' },
  ];
  const paperId = await insertExamplePaper(databases.owner, { imageKey: 'example/two.jpg', issuerName: 'EXAMPLE-ISSUER', lines });
  await saveTemplate([paperId]);
  const [example] = await listStoredExamples();
  const reading = example?.expected_reading as { parties: unknown[]; details: Record<string, unknown>[]; document_title: unknown; amount_vnd: unknown };
  assert.deepEqual(reading.parties, [{ role: 'issuer', type: 'company', printed_name: 'EXAMPLE-ISSUER', known_name: 'SAFE-A-COMPANY' }]);
  assert.deepEqual(reading.details[0], { label: 'Trọng lượng hàng', value: '27080 kg', number: 27080, unit: 'kg', meaning: 'Trọng lượng hàng', item: null, date_time: null });
  assert.equal(reading.details[1]?.date_time, '2026-03-01T08:15:00');
  assert.equal(reading.document_title, null);
  assert.equal(reading.amount_vnd, null);
});

test('a paper whose photo is deleted cannot be an example', async () => {
  const paperId = await insertExamplePaper(databases.owner, { imageKey: 'example/deleted.jpg', isPhotoDeleted: true });
  const result = JSON.parse(await saveTemplate([paperId]));
  assert.equal(result.ok, false);
  const { rows } = await databases.owner.query("SELECT 1 FROM document_templates WHERE name = 'EXAMPLE-TEMPLATE'");
  assert.equal(rows.length, 0);
});

test('saving the template again replaces its examples', async () => {
  const first = await insertExamplePaper(databases.owner, { imageKey: 'example/first.jpg' });
  const second = await insertExamplePaper(databases.owner, { imageKey: 'example/second.jpg' });
  const third = await insertExamplePaper(databases.owner, { imageKey: 'example/third.jpg' });
  await saveTemplate([first, second]);
  await saveTemplate([third]);
  const examples = await listStoredExamples();
  assert.deepEqual(examples.map(({ position, image_key: imageKey }) => ({ position, imageKey })), [{ position: 1, imageKey: 'example/third.jpg' }]);
});

test('a proposal from all papers returns the newest papers that still have a photo', async () => {
  await insertExamplePaper(databases.owner, { imageKey: 'example/oldest.jpg', createdAt: '2026-03-01T01:00:00Z' });
  const older = await insertExamplePaper(databases.owner, { imageKey: 'example/older.jpg', createdAt: '2026-03-01T02:00:00Z' });
  const newer = await insertExamplePaper(databases.owner, { imageKey: 'example/newer.jpg', createdAt: '2026-03-01T03:00:00Z' });
  const newest = await insertExamplePaper(databases.owner, { imageKey: 'example/newest.jpg', createdAt: '2026-03-01T04:00:00Z' });
  await insertExamplePaper(databases.owner, { imageKey: 'example/deleted.jpg', isPhotoDeleted: true, createdAt: '2026-03-01T05:00:00Z' });
  const proposals = JSON.parse(await callChatTool(databases.runtime, 'propose_document_templates', { paper_id: null })).proposals;
  const proposal = proposals.find((candidate: { kind: string }) => candidate.kind === 'phiếu cân');
  assert.deepEqual(proposal.example_paper_ids, [newest, newer, older]);
});

test('photo cleanup keeps an old photo that a template example uses and deletes an unused old one', async () => {
  const usedPaper = await insertExamplePaper(databases.owner, { imageKey: 'example/used.jpg' });
  await insertExamplePaper(databases.owner, { imageKey: 'example/unused.jpg' });
  await saveTemplate([usedPaper]);
  await databases.owner.query("UPDATE messages SET created_at = '2020-01-01T00:00:00Z' WHERE image_key LIKE 'example/%'");
  const storage = new MemoryPhotoStorage();
  const photo = { bytes: new Uint8Array([1]), contentType: 'image/jpeg' as const };
  await storage.put('example/used.jpg', photo);
  await storage.put('example/unused.jpg', photo);
  await cleanupOldPhotos({ database: databases.owner, photoStorage: storage, clock: { now: () => FIXED_NOW }, retentionDays: 30, batchSize: 100 });
  assert.notEqual(await storage.get('example/used.jpg'), null);
  assert.equal(await storage.get('example/unused.jpg'), null);
});

test('a proposal from one paper returns it as the example when it still has a photo', async () => {
  const paperId = await insertExamplePaper(databases.owner, { imageKey: 'example/one.jpg' });
  const [proposal] = JSON.parse(await callChatTool(databases.runtime, 'propose_document_templates', { paper_id: paperId })).proposals;
  assert.deepEqual(proposal.example_paper_ids, [paperId]);
});

test('a proposal from one paper returns no example when its photo is deleted or it is not accepted', async () => {
  const deletedPhoto = await insertExamplePaper(databases.owner, { imageKey: 'example/deleted.jpg', isPhotoDeleted: true });
  const needsReview = await insertExamplePaper(databases.owner, { imageKey: 'example/review.jpg', status: 'needs_review' });
  for (const paperId of [deletedPhoto, needsReview]) {
    const [proposal] = JSON.parse(await callChatTool(databases.runtime, 'propose_document_templates', { paper_id: paperId })).proposals;
    assert.deepEqual(proposal.example_paper_ids, []);
  }
});

test('the template list shows the example papers in order', async () => {
  const first = await insertExamplePaper(databases.owner, { imageKey: 'example/first.jpg' });
  const second = await insertExamplePaper(databases.owner, { imageKey: 'example/second.jpg' });
  await saveTemplate([second, first]);
  const { templates } = JSON.parse(await callChatTool(databases.runtime, 'list_document_templates', {}));
  const saved = templates.find((template: { name: string }) => template.name === 'EXAMPLE-TEMPLATE');
  assert.deepEqual(saved.examples, [{ position: 1, paper_id: second }, { position: 2, paper_id: first }]);
});

test('the save confirmation lists the example papers', async () => {
  const paperId = await insertExamplePaper(databases.owner, { imageKey: 'example/one.jpg', title: 'EXAMPLE-TITLE' });
  const harness = createToolHarness(databases.runtime);
  await harness.runTool('chat-gate', 'save_document_template', buildSaveArguments([paperId]));
  const [change] = harness.dependencies.waiting.list();
  assert.match(change?.question ?? '', /Giấy tờ ví dụ: EXAMPLE-TITLE, xe 99Z12345, số EX0001, ngày 01\/03\/2026/);
});

function saveTemplate(examplePaperIds: string[]): Promise<string> {
  return createToolHarness(databases.runtime).runTool('confirmed', 'save_document_template', buildSaveArguments(examplePaperIds));
}

function buildSaveArguments(examplePaperIds: string[]): object {
  return {
    name: 'EXAMPLE-TEMPLATE',
    kind: 'phiếu cân',
    issuer_company: null,
    stage: 'dispatch',
    description: '',
    fields: [{ name: 'Trọng lượng hàng', type: 'number', unit: 'kg', required: false }],
    example_paper_ids: examplePaperIds,
  };
}

type StoredExample = { position: number; image_key: string; expected_reading: Record<string, unknown> };

async function listStoredExamples(): Promise<StoredExample[]> {
  const { rows } = await databases.owner.query<StoredExample>(
    `SELECT example.position, example.image_key, example.expected_reading
     FROM document_template_examples example JOIN document_templates template ON template.id = example.template_id
     WHERE template.name = 'EXAMPLE-TEMPLATE' ORDER BY example.position`,
  );
  return rows;
}
