import { readWorkbookCells } from './read-workbook-cells.ts';
import type { ToolHarness } from './tool-harness.ts';

export async function observeToolSideEffects(harness: ToolHarness): Promise<unknown[]> {
  const { dependencies } = harness;
  return [
    ...(await observeStoredFiles(harness)),
    harness.companyReader.requests,
    harness.dropOffReader.requests,
    dependencies.waiting.list(),
    dependencies.sources.list(),
    dependencies.attachments.list(),
    dependencies.invites.listCodes(),
    dependencies.created.listTaskIds(),
  ];
}

async function observeStoredFiles({ storage }: ToolHarness): Promise<unknown[]> {
  const observed: unknown[] = [];
  for (const { key, bytes } of storage.listStoredFiles()) observed.push(key, await readWorkbookCells(bytes));
  return observed;
}
