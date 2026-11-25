import type { Transaction } from '../../db/transaction.ts';
import { buildMatchKey } from '../build-match-key.ts';
import { linkParty } from '../link-party.ts';
import type { PaperCompany, PaperCorrector } from './paper-correction.ts';

export type Organization = { id: string; name: string; type: string };

export type CompanyTarget = { organization: Organization; replacedNames: string | null; issuerKey: string | null };

type ReplacedParty = { role: string; organization_id: string | null; printed_name: string };

const FIND_ORGANIZATION_SQL = 'SELECT id, name, type FROM organizations WHERE id = $1 AND workspace_id = $2';

const LIST_REPLACED_PARTIES_SQL = `
  SELECT role, organization_id, printed_name
  FROM document_parties
  WHERE workspace_id = $1 AND document_id = $2 AND role = ANY($3::text[])
  ORDER BY created_at, id`;

export async function resolveCompanyTarget({ transaction, workspaceId }: PaperCorrector, paperId: string, company: PaperCompany): Promise<CompanyTarget | null> {
  const organization = await findOrAddOrganization(transaction, workspaceId, company);
  const parties = await transaction.query<ReplacedParty>(LIST_REPLACED_PARTIES_SQL, [workspaceId, paperId, company.roles.replaced]);
  if (isCompanyRight(parties, organization.id, company)) return null;
  const issuerKey = company.roles.assigned === 'issuer' ? buildMatchKey(organization.name) : null;
  return { organization, replacedNames: joinPrintedNames(parties), issuerKey };
}

async function findOrAddOrganization(transaction: Transaction, workspaceId: string, { name, organizationId, roles }: PaperCompany): Promise<Organization> {
  const party = { role: roles.assigned, type: 'company' as const, printed_name: name, known_name: null };
  const id = organizationId ?? (await linkParty(transaction, workspaceId, party, buildMatchKey(name)));
  const [organization] = await transaction.query<Organization>(FIND_ORGANIZATION_SQL, [id, workspaceId]);
  if (organization === undefined) throw new Error(`Organization ${id} is not saved in the workspace`);
  return organization;
}

function isCompanyRight(parties: ReplacedParty[], organizationId: string, { roles }: PaperCompany): boolean {
  return parties.some((party) => party.role === roles.assigned) && parties.every((party) => party.organization_id === organizationId);
}

function joinPrintedNames(parties: ReplacedParty[]): string | null {
  const names = [...new Set(parties.map((party) => party.printed_name))];
  return names.length === 0 ? null : names.join('; ');
}
