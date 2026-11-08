import type { Transaction } from '../db/transaction.ts';
import type { ReplyPlan } from '../intake/plan-reply.ts';
import { groupItems, pairItemsWithRecords, type DocumentDraft } from './document-draft.ts';
import { insertDocument } from './insert-document.ts';

export type DocumentMessage = { id: string; workspaceId: string };

export async function storeDocuments(transaction: Transaction, message: DocumentMessage, plan: ReplyPlan): Promise<void> {
  if (!plan.saved) return;
  const drafts = groupItems(pairItemsWithRecords(plan.readItems, plan.saved));
  await transaction.withScope({ workspaceId: message.workspaceId }, async () => {
    for (const draft of drafts) await storeDraft(transaction, message, draft);
  });
}

async function storeDraft(transaction: Transaction, message: DocumentMessage, draft: DocumentDraft): Promise<void> {
  await insertDocument(transaction, message, draft);
}
