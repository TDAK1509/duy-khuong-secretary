import type { CompanyClaim } from '../../documents/corrections/paper-correction.ts';
import { pickFactCompanies } from '../../facts/pick-fact-companies.ts';
import { ToolRefusal } from './tool-result.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';

export type ChosenCompany = { claim: CompanyClaim; organizationId: string | null; ambiguousNames: string[] };

const PICK_FAILED_ERROR = 'Chưa ghép được tên công ty với các công ty đã lưu. Chưa đổi gì. Thử lại sau.';

export async function chooseCompany({ companyReader, database }: AdminToolDependencies, workspaceId: string, claim: CompanyClaim | null): Promise<ChosenCompany | null> {
  if (claim === null) return null;
  const picks = await pickFactCompanies(companyReader ?? null, database, workspaceId, { [claim.slot]: claim.name });
  const pick = picks[claim.slot];
  if (pick === undefined) throw new ToolRefusal(PICK_FAILED_ERROR);
  if (pick.organizationIds.length > 1) return { claim, organizationId: null, ambiguousNames: pick.organizationNames };
  return { claim, organizationId: pick.organizationIds[0] ?? null, ambiguousNames: [] };
}
