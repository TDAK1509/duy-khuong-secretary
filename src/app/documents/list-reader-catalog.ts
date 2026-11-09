import type { Transaction } from '../db/transaction.ts';
import type { ReaderCatalog } from '../reading/document-rules.ts';

const MAX_KINDS = 30;
const MAX_ORGANIZATIONS = 50;
const MAX_MEANINGS = 60;

export async function listReaderCatalog(transaction: Transaction, workspaceId: string): Promise<ReaderCatalog> {
  return transaction.withScope({ workspaceId }, async () => ({
    kinds: await listNames(transaction, KINDS_QUERY, workspaceId, MAX_KINDS),
    organizations: await listNames(transaction, ORGANIZATIONS_QUERY, workspaceId, MAX_ORGANIZATIONS),
    workspaceMeanings: await listNames(transaction, MEANINGS_QUERY, workspaceId, MAX_MEANINGS),
  }));
}

async function listNames(transaction: Transaction, query: string, workspaceId: string, limit: number): Promise<string[]> {
  const rows = await transaction.query<{ name: string }>(query, [workspaceId, limit]);
  return rows.map((row) => row.name);
}

const KINDS_QUERY = `
  SELECT kind AS name FROM documents WHERE workspace_id = $1
  GROUP BY kind ORDER BY count(*) DESC, kind COLLATE "C" ASC LIMIT $2`;

const ORGANIZATIONS_QUERY = `
  SELECT organization.name FROM organizations organization
    LEFT JOIN document_parties party ON party.organization_id = organization.id
  WHERE organization.workspace_id = $1
  GROUP BY organization.id ORDER BY count(party.id) DESC, organization.name COLLATE "C" ASC LIMIT $2`;

const MEANINGS_QUERY = `
  SELECT meaning.name FROM meanings meaning
    LEFT JOIN document_lines line ON line.meaning_id = meaning.id
  WHERE meaning.workspace_id = $1
  GROUP BY meaning.id ORDER BY count(line.id) DESC, meaning.name COLLATE "C" ASC LIMIT $2`;
