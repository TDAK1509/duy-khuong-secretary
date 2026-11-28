import type { AccessScope } from '../access/access-scope.ts';
import { runInTransaction, type Database } from '../db/transaction.ts';
import { HEADER_ROW } from './format-workbook-sheet.ts';
import type { RecordedColumn, RecordedRow } from './recorded-export.ts';

export type ExportRecord = { id: string; kind: 'documents' | 'trip_report'; sheetName: string; columns: RecordedColumn[]; rows: RecordedRow[] };

export function saveExportRecord(database: Database, scope: AccessScope, record: ExportRecord): Promise<void> {
  return runInTransaction(database, async (transaction) => {
    await transaction.query(
      'INSERT INTO company_exports (id, workspace_id, requested_by_user_id, kind, sheet_name, columns) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
      [record.id, scope.workspaceId, scope.userId, record.kind, record.sheetName, JSON.stringify(record.columns)],
    );
    await transaction.query(INSERT_ROWS_SQL, [scope.workspaceId, record.id, JSON.stringify(record.rows.map(describeRow))]);
  });
}

function describeRow(row: RecordedRow, position: number) {
  return { id: row.id, row_number: HEADER_ROW + 1 + position, document_ids: row.documentIds, entry_ids: row.entryIds, cells: row.cells };
}

const INSERT_ROWS_SQL = `
  INSERT INTO company_export_rows (id, workspace_id, export_id, row_number, document_ids, entry_ids, cells)
  SELECT row.id, $1, $2, row.row_number,
    ARRAY(SELECT jsonb_array_elements_text(row.document_ids))::uuid[], ARRAY(SELECT jsonb_array_elements_text(row.entry_ids))::uuid[], row.cells
  FROM jsonb_to_recordset($3::jsonb) AS row(id uuid, row_number integer, document_ids jsonb, entry_ids jsonb, cells jsonb)`;
