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
