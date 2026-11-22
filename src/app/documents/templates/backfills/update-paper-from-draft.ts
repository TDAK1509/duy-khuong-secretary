import type { Transaction } from '../../../db/transaction.ts';
import { buildDocumentRow } from '../../insert-document.ts';
import { insertLines } from '../../insert-lines.ts';
import type { DocumentDraft } from '../../document-draft.ts';
import { linkDocumentToMatchingFacts } from '../../../facts/link-facts.ts';

export type PaperSource = { workspaceId: string; paperId: string; messageId: string };

const UPDATE_PAPER_SQL = `
  UPDATE documents SET kind = $3, stage = coalesce($4, stage), template_id = $5, summary = $6, details = $7::jsonb
  WHERE id = $1 AND workspace_id = $2`;

export async function updatePaperFromDraft(transaction: Transaction, { workspaceId, paperId, messageId }: PaperSource, draft: DocumentDraft): Promise<void> {
  const row = buildDocumentRow({ id: messageId, workspaceId }, draft);
  await transaction.query('DELETE FROM document_facts WHERE workspace_id = $1 AND document_id = $2', [workspaceId, paperId]);
  await transaction.query('DELETE FROM document_lines WHERE workspace_id = $1 AND document_id = $2', [workspaceId, paperId]);
  await transaction.query(UPDATE_PAPER_SQL, [paperId, workspaceId, row['kind'], row['stage'], row['template_id'], row['summary'], row['details']]);
  await insertLines(transaction, { id: messageId, workspaceId }, paperId, draft);
  await linkDocumentToMatchingFacts(transaction, workspaceId, paperId);
}
