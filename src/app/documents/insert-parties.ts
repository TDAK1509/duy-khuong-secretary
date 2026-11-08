import type { Transaction } from '../db/transaction.ts';
import type { ReadingParty } from '../reading/reading.ts';
import { buildMatchKey } from './build-match-key.ts';
import type { DocumentDraft } from './document-draft.ts';
import { insertRow } from './insert-row.ts';
import type { DocumentMessage } from './store-documents.ts';

export async function insertParties(transaction: Transaction, message: DocumentMessage, documentId: string, draft: DocumentDraft): Promise<void> {
  for (const party of draft.lineItems.flatMap(({ item }) => item.parties)) {
    const matchKey = buildMatchKey(party.printed_name);
    const organizationId = await findAliasedOrganization(transaction, message.workspaceId, matchKey);
    if (organizationId) await insertRow(transaction, 'document_parties', buildPartyRow(message, documentId, party, matchKey, organizationId));
  }
}

async function findAliasedOrganization(transaction: Transaction, workspaceId: string, matchKey: string): Promise<string | null> {
  const [alias] = await transaction.query<{ organization_id: string }>(
    'SELECT organization_id FROM organization_aliases WHERE workspace_id = $1 AND match_key = $2',
    [workspaceId, matchKey],
  );
  return alias?.organization_id ?? null;
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
    match_key: matchKey,
    organization_id: organizationId,
  };
}
