import type { Transaction } from '../db/transaction.ts';
import type { ReadingParty } from '../reading/reading.ts';
import { buildMatchKey } from './build-match-key.ts';
import type { DocumentDraft } from './document-draft.ts';
import { insertRow } from './insert-row.ts';
import { linkParty } from './link-party.ts';
import type { DocumentMessage } from './store-documents.ts';

type KeyedParty = { party: ReadingParty; matchKey: string };

export async function insertParties(transaction: Transaction, message: DocumentMessage, documentId: string, draft: DocumentDraft): Promise<void> {
  for (const { party, matchKey } of listDistinctParties(draft)) {
    const organizationId = await linkParty(transaction, message.workspaceId, party, matchKey);
    await insertRow(transaction, 'document_parties', buildPartyRow(message, documentId, party, matchKey, organizationId));
  }
}

function listDistinctParties(draft: DocumentDraft): KeyedParty[] {
  const keyed = draft.lineItems.flatMap(({ item }) => item.parties).map((party) => ({ party, matchKey: buildMatchKey(party.printed_name) }));
  const distinct = new Map(keyed.map((entry) => [`${entry.party.role}|${entry.party.type}|${entry.matchKey}`, entry]));
  return [...distinct.values()].filter(({ matchKey }) => matchKey !== '');
}

function buildPartyRow(
  { workspaceId }: DocumentMessage,
  documentId: string,
  party: ReadingParty,
  matchKey: string,
  organizationId: string,
): Record<string, unknown> {
  return {
    workspace_id: workspaceId,
    document_id: documentId,
    role: party.role,
    type: party.type,
    printed_name: party.printed_name.trim(),
    known_name: party.known_name?.trim() || null,
    match_key: matchKey,
    organization_id: organizationId,
  };
}
