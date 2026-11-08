import type { Transaction } from '../db/transaction.ts';
import type { ReplyPlan } from '../intake/plan-reply.ts';
import { groupItems, hasCompatiblePlate, pairItemsWithRecords, type DocumentDraft } from './document-draft.ts';
import { findAcceptedDocuments } from './find-accepted-documents.ts';
import { insertDocument, insertSources } from './insert-document.ts';

export type DocumentMessage = { id: string; workspaceId: string };

export async function storeDocuments(
  transaction: Transaction,
  message: DocumentMessage,
  plan: ReplyPlan,
  mayInsertDocuments: boolean,
): Promise<void> {
  if (!plan.saved) return;
  const drafts = groupItems(pairItemsWithRecords(plan.readItems, plan.saved));
  await transaction.withScope({ workspaceId: message.workspaceId }, async () => {
    for (const draft of drafts) await storeDraft(transaction, message, draft, mayInsertDocuments);
  });
}

async function storeDraft(transaction: Transaction, message: DocumentMessage, draft: DocumentDraft, mayInsertDocuments: boolean): Promise<void> {
  const accepted = await findAcceptedDocuments(transaction, message.workspaceId, draft);
  const same = accepted.find((document) => hasCompatiblePlate(document.vehicle_plate, draft.vehiclePlate));
  if (same) await insertSources(transaction, message, same.id, draft);
  else if (mayInsertDocuments) await insertDocument(transaction, message, draft, accepted.length > 0 ? 'needs_review' : 'accepted');
}
