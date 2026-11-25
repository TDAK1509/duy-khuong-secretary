import type { CompanyClaim } from '../../documents/corrections/paper-correction.ts';
import { pickFactCompanies } from '../../facts/pick-fact-companies.ts';
import { ToolRefusal } from './tool-result.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';

const PICK_FAILED_ERROR = 'Chưa ghép được tên công ty với các công ty đã lưu. Chưa đổi gì. Thử lại sau.';

export async function chooseOrganizationId({ companyReader, database }: AdminToolDependencies, workspaceId: string, claim: CompanyClaim): Promise<string | null> {
  const picks = await pickFactCompanies(companyReader ?? null, database, workspaceId, { [claim.slot]: claim.name });
  const pick = picks[claim.slot];
  if (pick === undefined) throw new ToolRefusal(PICK_FAILED_ERROR);
  if (pick.organizationIds.length > 1) throw new ToolRefusal(describeAmbiguousCompany(claim.name, pick.organizationNames));
  return pick.organizationIds[0] ?? null;
}

function describeAmbiguousCompany(name: string, organizationNames: string[]): string {
  return `Có nhiều công ty đã lưu khớp với "${name}": ${organizationNames.join('; ')}. Chưa đổi gì. Hỏi lại quản lý muốn chọn công ty nào.`;
}
