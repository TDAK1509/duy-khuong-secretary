import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { A_EXPORT_ID, B_EXPORT_ID } from './seed-ids.ts';

const SEEDED_EXPORT_IDS = [A_EXPORT_ID, B_EXPORT_ID];

export type RecordedCell = { value_type: string; value: string | number | boolean | null; source: { kind: string; document_id?: string; entry_id?: string; field: string; snapshot: Record<string, unknown> } };

export type RecordedRow = { id: string; row_number: number; document_ids: string[]; entry_ids: string[]; cells: Record<string, RecordedCell>; columns: { key: string; name: string; value_type: string; unit?: string }[] };

export async function listExportRows(owner: PostgresPool): Promise<RecordedRow[]> {
  const { rows } = await owner.query<RecordedRow>(
    `SELECT row.id, row.row_number, row.document_ids, row.entry_ids, row.cells, export.columns
     FROM company_export_rows row JOIN company_exports export ON export.id = row.export_id AND export.workspace_id = row.workspace_id
     WHERE export.id <> ALL($1::uuid[])
     ORDER BY export.created_at, row.row_number`,
    [SEEDED_EXPORT_IDS],
  );
  return rows;
}

export function findCell(row: RecordedRow, columnName: string): RecordedCell {
  const column = row.columns.find((candidate) => candidate.name === columnName);
  const cell = column === undefined ? undefined : row.cells[column.key];
  if (cell === undefined) throw new Error(`The export row has no cell for column "${columnName}"`);
  return cell;
}

export async function countExports(owner: PostgresPool): Promise<number> {
  const { rows } = await owner.query<{ count: number }>('SELECT count(*)::int AS count FROM company_exports WHERE id <> ALL($1::uuid[])', [SEEDED_EXPORT_IDS]);
  return rows[0]?.count ?? 0;
}
