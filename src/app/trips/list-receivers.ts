import type { Database } from '../db/transaction.ts';

export type Receiver = { id: string; name: string; aliases: string[] };

const LIST_RECEIVERS_SQL = `
  SELECT organization.id, organization.name,
    COALESCE(array_agg(alias.printed_name ORDER BY alias.printed_name) FILTER (WHERE alias.id IS NOT NULL), '{}') AS aliases
  FROM organizations organization
  LEFT JOIN organization_aliases alias ON alias.organization_id = organization.id AND alias.workspace_id = organization.workspace_id
  WHERE organization.workspace_id = $1 AND organization.id = ANY($2::uuid[])
  GROUP BY organization.id ORDER BY organization.name, organization.id`;

export async function listReceivers(database: Database, workspaceId: string, organizationIds: string[]): Promise<Receiver[]> {
  if (organizationIds.length === 0) return [];
  const { rows } = await database.query<Receiver>(LIST_RECEIVERS_SQL, [workspaceId, organizationIds]);
  return rows;
}
