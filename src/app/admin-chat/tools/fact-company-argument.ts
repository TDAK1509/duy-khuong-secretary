import type { Database } from '../../db/transaction.ts';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import type { FactCompany } from '../../facts/fact.ts';
import { resolveFactCompany } from '../../facts/resolve-fact-company.ts';
import { refuseInvalidArgument, ToolRefusal } from './tool-result.ts';

export type ResolvedCompany = FactCompany & { matchedOrganization: string | null };

export async function readCompanyArgument(database: Database, workspaceId: string, raw: string | null, field: string): Promise<ResolvedCompany | null> {
  if (raw === null) return null;
  const name = raw.trim();
  const matchKey = buildMatchKey(name);
  if (matchKey === '') refuseInvalidArgument(field);
  const resolution = await resolveFactCompany(database, workspaceId, matchKey);
  if (resolution.kind === 'ambiguous') throw new ToolRefusal(describeAmbiguousCompany(name, resolution.organizationNames));
  if (resolution.kind === 'unknown') return { name, matchKey, matchedOrganization: null };
  return { name, matchKey: resolution.matchKey, matchedOrganization: resolution.organizationName };
}

function describeAmbiguousCompany(name: string, organizationNames: string[]): string {
  return `Có nhiều công ty đã lưu khớp với "${name}": ${organizationNames.join('; ')}. Hỏi lại quản lý muốn chọn công ty nào.`;
}
