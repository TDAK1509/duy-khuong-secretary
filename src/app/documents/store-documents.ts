import type { Transaction } from '../db/transaction.ts';
import type { ReplyPlan } from '../intake/plan-reply.ts';
import { listMemberFacts } from '../memory/list-member-facts.ts';
import type { FactReader } from '../memory/fact-readers.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import { groupItems, hasCompatiblePlate, pairItemsWithRecords, type DocumentDraft } from './document-draft.ts';
import { findAcceptedDocuments } from './find-accepted-documents.ts';
import { insertDocument, insertSources } from './insert-document.ts';
import { extractPlateFromFacts } from './plate-from-facts.ts';

export type DocumentMessage = { id: string; workspaceId: string };

export async function storeDocuments(
  transaction: Transaction,
  message: DocumentMessage,
  plan: ReplyPlan,
  mayInsertDocuments: boolean,
  sender?: FactReader | null,
): Promise<void> {
  if (!plan.saved) return;
  const drafts = groupItems(pairItemsWithRecords(plan.readItems, plan.saved));
  const knownPlate = sender ? await loadKnownPlate(transaction, message.workspaceId, sender) : null;
  await transaction.withScope({ workspaceId: message.workspaceId }, async () => {
    await lockWorkspaceRecords(transaction, message.workspaceId);
    for (const draft of drafts) {
      if (knownPlate) draft.vehiclePlate = knownPlate;
      await storeDraft(transaction, message, draft, mayInsertDocuments);
    }
  });
}

async function loadKnownPlate(transaction: Transaction, workspaceId: string, sender: FactReader): Promise<string | null> {
  const facts = await listMemberFacts(transaction, workspaceId, sender);
  return extractPlateFromFacts(facts);
}

async function storeDraft(transaction: Transaction, message: DocumentMessage, draft: DocumentDraft, mayInsertDocuments: boolean): Promise<void> {
  const accepted = await findAcceptedDocuments(transaction, message.workspaceId, draft);
  const same = accepted.find((document) => hasCompatiblePlate(document.vehicle_plate, draft.vehiclePlate));
  if (same) await insertSources(transaction, message, same.id, draft);
  else if (mayInsertDocuments) await insertDocument(transaction, message, draft);
}
