import { runInTransaction, type Database } from '../db/transaction.ts';

export type ExampleDocument = {
  kind: string;
  title: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  vehiclePlate: string | null;
};

export const EXAMPLE_DOCUMENT_LIMIT = 3;

const LIST_EXAMPLES_SQL = `
  SELECT document.kind, document.title, document.document_number AS "documentNumber",
    to_char(document.document_date, 'YYYY-MM-DD') AS "documentDate", document.vehicle_plate AS "vehiclePlate"
  FROM company_knowledge_links link
  JOIN documents document ON document.id = link.document_id AND document.workspace_id = link.workspace_id
  WHERE link.entry_id = $1 AND link.workspace_id = $2
  ORDER BY document.document_date DESC NULLS LAST, document.created_at DESC, document.id
  LIMIT ${EXAMPLE_DOCUMENT_LIMIT}
`;

export function listExampleDocuments(database: Database, workspaceId: string, entryId: string): Promise<ExampleDocument[]> {
  return runInTransaction(database, (transaction) => transaction.query<ExampleDocument>(LIST_EXAMPLES_SQL, [entryId, workspaceId]));
}
