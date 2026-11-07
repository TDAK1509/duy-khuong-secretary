import type { Database } from '../../db/transaction.ts';
import { listNumberLabels } from '../../records/list-number-labels.ts';

export async function runListNumberLabels(database: Database): Promise<string> {
  const labels = await listNumberLabels(database);
  return JSON.stringify({ ok: true, labels });
}
