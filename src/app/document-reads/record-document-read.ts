import type { Transaction } from '../db/transaction.ts';

export type DocumentReadOutcome = 'saved' | 'no_document' | 'test_data';

export async function recordDocumentRead(
  transaction: Transaction,
  message: { id: string; workspaceId: string },
  outcome: DocumentReadOutcome,
): Promise<void> {
  await transaction.query('INSERT INTO document_reads (workspace_id, message_id, outcome) VALUES ($1, $2, $3)', [
    message.workspaceId,
    message.id,
    outcome,
  ]);
}
