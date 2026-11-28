import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { validateReading } from '../../src/app/reading/reading.ts';
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
