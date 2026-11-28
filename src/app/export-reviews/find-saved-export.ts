import type { Transaction } from '../db/transaction.ts';
import type { RecordedCell, RecordedColumn } from '../documents/recorded-export.ts';

export type SavedRow = { id: string; rowNumber: number; documentIds: string[]; entryIds: string[]; cells: Record<string, RecordedCell> };

export type SavedExport = { id: string; createdAt: Date; sheetName: string; columns: RecordedColumn[]; rows: SavedRow[] };

type ExportRecord = { id: string; created_at: Date; sheet_name: string; columns: RecordedColumn[] };

type RowRecord = { id: string; row_number: number; document_ids: string[]; entry_ids: string[]; cells: Record<string, RecordedCell> };

export async function findSavedExport(transaction: Transaction, workspaceId: string, exportId: string): Promise<SavedExport | null> {
  const [record] = await transaction.query<ExportRecord>('SELECT id, created_at, sheet_name, columns FROM company_exports WHERE id = $1 AND workspace_id = $2', [exportId, workspaceId]);
  if (record === undefined) return null;
  const rows = await transaction.query<RowRecord>('SELECT id, row_number, document_ids, entry_ids, cells FROM company_export_rows WHERE export_id = $1 AND workspace_id = $2 ORDER BY row_number', [exportId, workspaceId]);
  return { id: record.id, createdAt: record.created_at, sheetName: record.sheet_name, columns: record.columns, rows: rows.map(toSavedRow) };
}

function toSavedRow(row: RowRecord): SavedRow {
  return { id: row.id, rowNumber: row.row_number, documentIds: row.document_ids, entryIds: row.entry_ids, cells: row.cells };
}
