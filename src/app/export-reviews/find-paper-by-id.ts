import type { Transaction } from '../db/transaction.ts';
import type { FoundPaper } from '../documents/corrections/paper-correction.ts';

const FIND_PAPER_SQL = `
  SELECT document.id, document.kind, document.title, document.document_number, to_char(document.document_date, 'YYYY-MM-DD') AS document_date,
    document.vehicle_plate AS plate, document.stage, NULL::text AS sender, '' AS sent_at
  FROM documents document
  WHERE document.workspace_id = $1 AND document.id = $2 AND document.status = 'accepted'`;

export async function findPaperById(transaction: Transaction, workspaceId: string, paperId: string): Promise<FoundPaper | null> {
  const [paper] = await transaction.query<FoundPaper>(FIND_PAPER_SQL, [workspaceId, paperId]);
  return paper ?? null;
}
