import type { Transaction } from '../db/transaction.ts';
import type { ReplyPlan } from '../intake/plan-reply.ts';
import { groupItems, pairItemsWithRecords, type DocumentDraft } from './document-draft.ts';
import { findAcceptedDocuments } from './find-accepted-documents.ts';
import { insertDocument, insertSources } from './insert-document.ts';

export type DocumentMessage = { id: string; workspaceId: string };

export async function storeDocuments(transaction: Transaction, message: DocumentMessage, plan: ReplyPlan): Promise<void> {
  if (!plan.saved) return;
  const drafts = groupItems(pairItemsWithRecords(plan.readItems, plan.saved));
  await transaction.withScope({ workspaceId: message.workspaceId }, async () => {
    for (const draft of drafts) await storeDraft(transaction, message, draft);
  });
}

async function storeDraft(transaction: Transaction, message: DocumentMessage, draft: DocumentDraft): Promise<void> {
  const accepted = await findAcceptedDocuments(transaction, message.workspaceId, draft);
  const same = accepted.find((document) => hasCompatiblePlate(document.vehicle_plate, draft.vehiclePlate));
  if (same) await insertSources(transaction, message, same.id, draft);
  else await insertDocument(transaction, message, draft);
}

function hasCompatiblePlate(first: string | null, second: string | null): boolean {
  return first === null || second === null || first === second;
}
