import type { Database, Transaction } from '../db/transaction.ts';
import { runInTransaction } from '../db/transaction.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';

export type SavedPaper = {
  id: string;
  kind: string;
  title: string | null;
  plate: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  photoCount: number;
};

type SavedPaperRow = {
  id: string;
  kind: string;
  title: string | null;
  plate: string | null;
  document_number: string | null;
  document_date: string | null;
  photo_count: number;
};

const SELECT_SAVED_PAPERS_SQL = `
  SELECT document.id, document.kind, document.title, document.vehicle_plate AS plate, document.document_number,
    to_char(document.document_date, 'DD/MM/YYYY') AS document_date,
    (SELECT count(DISTINCT source.message_id)::int FROM document_sources source
      WHERE source.workspace_id = document.workspace_id AND source.document_id = document.id) AS photo_count
  FROM unnest($2::uuid[]) WITH ORDINALITY AS wanted (id, position)
  JOIN documents document ON document.id = wanted.id
  WHERE document.workspace_id = $1
  ORDER BY wanted.position`;

export function deleteSavedPapers(database: Database, workspaceId: string, paperIds: string[]): Promise<SavedPaper[] | null> {
  return runInTransaction(database, async (transaction) => {
    await lockWorkspaceRecords(transaction, workspaceId);
    const papers = await findSavedPapers(transaction, workspaceId, paperIds);
    if (papers === null) return null;
    await transaction.query('DELETE FROM documents WHERE workspace_id = $1 AND id = ANY($2::uuid[])', [workspaceId, paperIds]);
    return papers;
  });
}

export async function findSavedPapers(transaction: Transaction, workspaceId: string, paperIds: string[]): Promise<SavedPaper[] | null> {
  const rows = await transaction.query<SavedPaperRow>(SELECT_SAVED_PAPERS_SQL, [workspaceId, paperIds]);
  return rows.length === paperIds.length ? rows.map(toSavedPaper) : null;
}

function toSavedPaper(row: SavedPaperRow): SavedPaper {
  return { id: row.id, kind: row.kind, title: row.title, plate: row.plate, documentNumber: row.document_number, documentDate: row.document_date, photoCount: row.photo_count };
}

export function describeSavedPaper({ kind, title, plate, documentNumber, documentDate }: SavedPaper): string {
  const parts = [title ?? kind, plate === null ? null : `xe ${plate}`, documentNumber === null ? null : `số ${documentNumber}`, documentDate === null ? null : `ngày ${documentDate}`];
  return parts.filter((part) => part !== null).join(', ');
}
