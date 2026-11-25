import type { Database } from '../../db/transaction.ts';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import type { FactCompany } from '../../facts/fact.ts';
import type { PickedCompanies, SlotNames } from '../../facts/pick-fact-companies.ts';
import { resolveFactCompany } from '../../facts/resolve-fact-company.ts';
import { ToolRefusal } from './tool-result.ts';

export type ResolvedCompany = FactCompany & { matchedOrganization: string | null };

export async function readCompanyArgument(database: Database, workspaceId: string, raw: string | null, pick?: PickedCompanies): Promise<ResolvedCompany | null> {
  if (raw === null) return null;
  const name = raw.trim();
  const matchKey = buildMatchKey(name);
  if (matchKey === '') refuseInvalidCompany(raw);
  const resolution = await resolveFactCompany(database, workspaceId, matchKey);
  if (pick !== undefined) return readPickedCompany(name, resolution.kind === 'known' ? resolution.matchKey : matchKey, pick);
  if (resolution.kind === 'ambiguous') throw new ToolRefusal(describeAmbiguousCompany(name, resolution.organizationNames));
  if (resolution.kind === 'unknown') return { name, matchKey, organizationIds: null, matchedOrganization: null };
  return { name, matchKey: resolution.matchKey, organizationIds: null, matchedOrganization: resolution.organizationName };
}

export function refuseInvalidCompany(received: string): never {
  throw new ToolRefusal(`Tên công ty "${received}" không có chữ nào. Cần tên công ty đúng như quản lý nêu, ví dụ "Công ty ABC". Sửa tên rồi gọi lại.`);
}

function readPickedCompany(name: string, matchKey: string, pick: PickedCompanies): ResolvedCompany {
  return { name, matchKey, organizationIds: pick.organizationIds, matchedOrganization: pick.organizationNames.join('; ') || null };
}

function describeAmbiguousCompany(name: string, organizationNames: string[]): string {
  return `Có nhiều công ty đã lưu khớp với "${name}": ${organizationNames.join('; ')}. Hỏi lại quản lý muốn chọn công ty nào.`;
}

export type CompanyArguments = { pickup_company: string | null; dropoff_company: string | null; customer_company: string | null };

export function listSlotNames(request: CompanyArguments): SlotNames {
  const names: SlotNames = {};
  if (request.pickup_company !== null) names.pickup = request.pickup_company.trim();
  if (request.dropoff_company !== null) names.dropoff = request.dropoff_company.trim();
  if (request.customer_company !== null) names.customer = request.customer_company.trim();
  return names;
}
