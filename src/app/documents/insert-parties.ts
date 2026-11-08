import type { Transaction } from '../db/transaction.ts';
import type { ReadingParty } from '../reading/reading.ts';
import { buildMatchKey } from './build-match-key.ts';
import type { DocumentDraft } from './document-draft.ts';
import { insertRow } from './insert-row.ts';
import { linkParty, type PartyLink } from './link-party.ts';
import type { DocumentMessage } from './store-documents.ts';

export async function insertParties(transaction: Transaction, message: DocumentMessage, documentId: string, draft: DocumentDraft): Promise<void> {
  for (const party of draft.lineItems.flatMap(({ item }) => item.parties)) {
    const matchKey = buildMatchKey(party.printed_name);
    const link = await linkParty(transaction, message.workspaceId, party, matchKey);
    if (link) await insertRow(transaction, 'document_parties', buildPartyRow(message, documentId, party, matchKey, link));
  }
}

function buildPartyRow(
  { workspaceId }: DocumentMessage,
  documentId: string,
  party: ReadingParty,
  matchKey: string,
  link: PartyLink,
): Record<string, unknown> {
  return {
    workspace_id: workspaceId,
    document_id: documentId,
    role: party.role,
    type: party.type,
    printed_name: party.printed_name.trim(),
    match_key: matchKey,
    ...link,
  };
}
