import type { Transaction } from '../db/transaction.ts';
import type { ReplyPlan } from '../intake/plan-reply.ts';
import { listMemberFacts } from '../memory/list-member-facts.ts';
import type { FactReader } from '../memory/fact-readers.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import type { TaggedDriver } from '../intake/tag-named-driver.ts';
import { groupItems, hasCompatiblePlate, pairItemsWithRecords, type DocumentDraft } from './document-draft.ts';
import { findAcceptedDocuments } from './find-accepted-documents.ts';
import { linkDocumentToMatchingFacts } from '../facts/link-facts.ts';
import { insertDocument, insertSources } from './insert-document.ts';
import { extractPlateFromFacts } from './plate-from-facts.ts';

export type DocumentMessage = { id: string; workspaceId: string; driverUserId?: string | null };

export async function storeDocuments(
  transaction: Transaction,
  message: DocumentMessage,
  plan: ReplyPlan,
  mayInsertDocuments: boolean,
  sender?: FactReader | null,
  driver: TaggedDriver | null = null,
): Promise<void> {
  if (!plan.saved) return;
  const drafts = groupItems(pairItemsWithRecords(plan.readItems, plan.saved));
  const knownPlate = await loadKnownPlate(transaction, message.workspaceId, driver ? { userId: driver.userId, role: 'member' } : sender);
  const taggedMessage = { ...message, driverUserId: driver?.userId ?? null };
  await transaction.withScope({ workspaceId: message.workspaceId }, async () => {
    await lockWorkspaceRecords(transaction, message.workspaceId);
    for (const draft of drafts) {
      if (knownPlate) draft.vehiclePlate = knownPlate;
      await storeDraft(transaction, taggedMessage, draft, mayInsertDocuments);
    }
  });
}

async function loadKnownPlate(transaction: Transaction, workspaceId: string, plateOwner: FactReader | null | undefined): Promise<string | null> {
  if (!plateOwner) return null;
  const facts = await listMemberFacts(transaction, workspaceId, plateOwner);
  return extractPlateFromFacts(facts);
}

async function storeDraft(transaction: Transaction, message: DocumentMessage, draft: DocumentDraft, mayInsertDocuments: boolean): Promise<void> {
  const accepted = await findAcceptedDocuments(transaction, message.workspaceId, draft);
  const same = accepted.find((document) => hasCompatiblePlate(document.vehicle_plate, draft.vehiclePlate));
  if (same) await addSources(transaction, message, same.id, draft);
  else if (mayInsertDocuments) await insertDocument(transaction, message, draft);
}

async function addSources(transaction: Transaction, message: DocumentMessage, documentId: string, draft: DocumentDraft): Promise<void> {
  await insertSources(transaction, message, documentId, draft);
  await linkDocumentToMatchingFacts(transaction, message.workspaceId, documentId);
}
