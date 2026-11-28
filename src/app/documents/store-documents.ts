import type { Transaction } from '../db/transaction.ts';
import type { ReplyPlan } from '../intake/plan-reply.ts';
import { listMemberFacts } from '../memory/list-member-facts.ts';
import type { FactReader } from '../memory/fact-readers.ts';
import type { NewRecord } from '../records/new-record.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import type { TaggedDriver } from '../intake/tag-named-driver.ts';
import { groupItems, hasCompatiblePlate, pairItemsWithRecords, type DocumentDraft } from './document-draft.ts';
import { findAcceptedDocuments } from './find-accepted-documents.ts';
import { linkDocumentToMatchingEntries } from '../facts/link-facts.ts';
import { insertDocument, insertSources } from './insert-document.ts';
import { extractPlateFromFacts } from './plate-from-facts.ts';
import type { KeptPaper } from './kept-paper.ts';
import { findSavedPapers } from './saved-papers.ts';

export type DocumentMessage = { id: string; workspaceId: string; driverUserId?: string | null };

type KeptDraft = { paperId: string; records: NewRecord[] };

export async function storeDocuments(
  transaction: Transaction,
  message: DocumentMessage,
  plan: ReplyPlan,
  mayInsertDocuments: boolean,
  sender?: FactReader | null,
  driver: TaggedDriver | null = null,
): Promise<KeptPaper[]> {
  if (!plan.saved) return [];
  const drafts = groupItems(pairItemsWithRecords(plan.readItems, plan.saved));
  const knownPlate = await loadKnownPlate(transaction, message.workspaceId, pickPlateOwner(driver, sender));
  if (knownPlate) for (const draft of drafts) draft.vehiclePlate = knownPlate;
  const taggedMessage = { ...message, driverUserId: driver?.userId ?? null };
  return transaction.withScope({ workspaceId: message.workspaceId }, async () => {
    await lockWorkspaceRecords(transaction, message.workspaceId);
    const keptDrafts = await storeDrafts(transaction, taggedMessage, drafts, mayInsertDocuments);
    return loadKeptPapers(transaction, message.workspaceId, keptDrafts);
  });
}

function pickPlateOwner(driver: TaggedDriver | null, sender: FactReader | null | undefined): FactReader | null {
  if (driver !== null) return { userId: driver.userId, role: 'member' };
  return sender ?? null;
}

async function loadKnownPlate(transaction: Transaction, workspaceId: string, plateOwner: FactReader | null | undefined): Promise<string | null> {
  if (!plateOwner) return null;
  const facts = await listMemberFacts(transaction, workspaceId, plateOwner);
  return extractPlateFromFacts(facts);
}

async function storeDrafts(transaction: Transaction, message: DocumentMessage, drafts: DocumentDraft[], mayInsertDocuments: boolean): Promise<KeptDraft[]> {
  const kept: KeptDraft[] = [];
  for (const draft of drafts) {
    const paperId = await storeDraft(transaction, message, draft, mayInsertDocuments);
    if (paperId !== null) kept.push({ paperId, records: draft.items.map(({ record }) => record) });
  }
  return kept;
}

async function storeDraft(transaction: Transaction, message: DocumentMessage, draft: DocumentDraft, mayInsertDocuments: boolean): Promise<string | null> {
  const accepted = await findAcceptedDocuments(transaction, message.workspaceId, draft);
  const same = accepted.find((document) => hasCompatiblePlate(document.vehicle_plate, draft.vehiclePlate));
  if (same) return addSources(transaction, message, same.id, draft);
  if (mayInsertDocuments) await insertDocument(transaction, message, draft);
  return null;
}

async function addSources(transaction: Transaction, message: DocumentMessage, documentId: string, draft: DocumentDraft): Promise<string> {
  await insertSources(transaction, message, documentId, draft);
  await linkDocumentToMatchingEntries(transaction, message.workspaceId, documentId);
  return documentId;
}

async function loadKeptPapers(transaction: Transaction, workspaceId: string, keptDrafts: KeptDraft[]): Promise<KeptPaper[]> {
  if (keptDrafts.length === 0) return [];
  const paperIds = [...new Set(keptDrafts.map(({ paperId }) => paperId))];
  const papers = new Map(((await findSavedPapers(transaction, workspaceId, paperIds)) ?? []).map((paper) => [paper.id, paper]));
  return keptDrafts.flatMap(({ paperId, records }) => {
    const paper = papers.get(paperId);
    return paper === undefined ? [] : [{ paper, records }];
  });
}
