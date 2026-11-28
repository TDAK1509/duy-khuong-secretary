import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { validateReading } from '../../src/app/reading/reading.ts';
import { callChatTool } from './support/call-chat-tool.ts';
import { insertExamplePaper } from './support/insert-example-paper.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { resetDatabase } from './support/reset-database.ts';
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
  await insertExamplePaper(databases.owner, { imageKey: 'example/oldest.jpg' });
  const older = await insertExamplePaper(databases.owner, { imageKey: 'example/older.jpg' });
  const newer = await insertExamplePaper(databases.owner, { imageKey: 'example/newer.jpg' });
  const newest = await insertExamplePaper(databases.owner, { imageKey: 'example/newest.jpg' });
  await insertExamplePaper(databases.owner, { imageKey: 'example/deleted.jpg', isPhotoDeleted: true });
  const proposals = JSON.parse(await callChatTool(databases.runtime, 'propose_document_templates', { paper_id: null })).proposals;
  const proposal = proposals.find((candidate: { kind: string }) => candidate.kind === 'phiếu cân');
  assert.deepEqual(proposal.example_paper_ids, [newest, newer, older]);
});

test('the template list shows the example papers in order', async () => {
  const first = await insertExamplePaper(databases.owner, { imageKey: 'example/first.jpg' });
  const second = await insertExamplePaper(databases.owner, { imageKey: 'example/second.jpg' });
  await saveTemplate([second, first]);
  const { templates } = JSON.parse(await callChatTool(databases.runtime, 'list_document_templates', {}));
  const saved = templates.find((template: { name: string }) => template.name === 'EXAMPLE-TEMPLATE');
  assert.deepEqual(saved.examples, [{ position: 1, paper_id: second }, { position: 2, paper_id: first }]);
});

function saveTemplate(examplePaperIds: string[]): Promise<string> {
  const toolArguments = {
    name: 'EXAMPLE-TEMPLATE',
    kind: 'phiếu cân',
    issuer_company: null,
    stage: 'dispatch',
    description: '',
    fields: [{ name: 'Trọng lượng hàng', type: 'number', unit: 'kg', required: false }],
    example_paper_ids: examplePaperIds,
  };
  return createToolHarness(databases.runtime).runTool('confirmed', 'save_document_template', toolArguments);
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
