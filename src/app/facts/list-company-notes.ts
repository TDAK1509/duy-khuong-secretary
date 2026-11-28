import { runInTransaction, type Database } from '../db/transaction.ts';
import type { StoredEntry } from './company-knowledge.ts';
import { selectEntries } from './select-entries.ts';

const UNKNOWN_AUTHOR = '(không rõ người lưu)';

export async function listCompanyNoteLines(database: Database, workspaceId: string): Promise<string[]> {
  const entries = await runInTransaction(database, (transaction) => selectEntries(transaction, { where: 'entry.workspace_id = $1 AND entry.then_note IS NOT NULL', values: [workspaceId] }));
  return entries.map(describeNoteLine);
}

function describeNoteLine(entry: StoredEntry): string {
  return `- ${entry.authorName ?? UNKNOWN_AUTHOR}: ${describeConditions(entry)}: ${entry.outcomes.note}`;
}

function describeConditions({ goods, sides, vehiclePlate, driverName }: StoredEntry): string {
  const conditions = [
    goods === null ? null : `hàng ${goods}`,
    sides.pickup.name === null ? null : `lấy hàng ở ${sides.pickup.name}`,
    sides.dropoff.name === null ? null : `đổ hàng ở ${sides.dropoff.name}`,
    vehiclePlate === null ? null : `xe ${vehiclePlate}`,
    driverName === null ? null : `tài xế ${driverName}`,
  ];
  return conditions.filter((condition) => condition !== null).join(', ');
}
