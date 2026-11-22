import type { Transaction } from '../db/transaction.ts';
import { listDocumentTemplates } from './templates/list-document-templates.ts';
import type { ReaderTemplate } from '../reading/reader-template.ts';

export function listReaderTemplates(transaction: Transaction, workspaceId: string): Promise<ReaderTemplate[]> {
  return transaction.withScope({ workspaceId }, () => listDocumentTemplates(transaction, workspaceId));
}
