import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_ID = '1c942bdf-7a19-43fc-96a3-d0936713e7db';

const WRONG_DOCUMENTS = [
  { documentId: '7609ad10-c829-401c-ad87-de47c7c2a40f', messageId: '9f2a1ad7-357a-4103-a4cb-2667f408b7b6' },
  { documentId: 'c06281a1-a72d-437d-95a2-4e35e597e480', messageId: '1d55ac34-7767-4f40-bbab-97cd1f79c2fc' },
];

const WRONG_RECORDS = [
  { recordId: '37cd85c3-2179-428c-8253-041d34c7c02f', messageId: '9f2a1ad7-357a-4103-a4cb-2667f408b7b6' },
  { recordId: '53bcc7c3-67da-43c6-b8c9-f88b1b446151', messageId: '1d55ac34-7767-4f40-bbab-97cd1f79c2fc' },
];

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['documents', 'document_sources', 'document_lines', 'document_parties', 'document_facts', 'records']);
  for (const { documentId, messageId } of WRONG_DOCUMENTS) pgm.sql(buildDeleteDocument(documentId, messageId));
  for (const { recordId, messageId } of WRONG_RECORDS) pgm.sql(buildDeleteRecord(recordId, messageId));
}

function buildDeleteDocument(documentId: string, messageId: string): string {
  return `
    DELETE FROM documents
    WHERE id = '${documentId}' AND workspace_id = '${WORKSPACE_ID}'
      AND EXISTS (SELECT 1 FROM document_sources WHERE document_id = '${documentId}' AND message_id = '${messageId}')
      AND (SELECT count(*) FROM document_sources WHERE document_id = '${documentId}') = 1`;
}

function buildDeleteRecord(recordId: string, messageId: string): string {
  return `DELETE FROM records WHERE id = '${recordId}' AND workspace_id = '${WORKSPACE_ID}' AND message_id = '${messageId}'`;
}
