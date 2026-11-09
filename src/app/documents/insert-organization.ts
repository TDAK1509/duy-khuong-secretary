import type { Transaction } from '../db/transaction.ts';
import { insertRow } from './insert-row.ts';

const MAX_ORGANIZATION_NAME_LENGTH = 200;

export type NewOrganization = { type: string; printedName: string; matchKey: string };

export async function insertOrganization(transaction: Transaction, workspaceId: string, organization: NewOrganization): Promise<string> {
  const printedName = organization.printedName.trim();
  const organizationId = await insertRow(transaction, 'organizations', {
    workspace_id: workspaceId,
    type: organization.type,
    name: printedName.slice(0, MAX_ORGANIZATION_NAME_LENGTH),
  });
  await insertRow(transaction, 'organization_aliases', {
    workspace_id: workspaceId,
    organization_id: organizationId,
    printed_name: printedName,
    match_key: organization.matchKey,
  });
  return organizationId;
}
