import { readCompanyRoles } from '../../documents/corrections/company-roles.ts';
import type { CompanyClaim, CompanyRoles, FoundPaper, PaperCompany, PaperStage } from '../../documents/corrections/paper-correction.ts';
import type { CompanySlot } from '../../facts/pick-fact-companies.ts';
import { ToolRefusal } from './tool-result.ts';

export type PickedCompany = { organizationId: string | null };

const SLOT_NAMES: Record<CompanySlot, string> = { pickup: 'nơi lấy hàng', dropoff: 'nơi đổ hàng', customer: 'khách hàng' };

const PAPER_CHANGED_ERROR = 'Giấy tờ vừa thay đổi nên chưa ghép được tên công ty. Chưa đổi gì. Gọi lại một lần nữa.';

export function settleCompany(paper: FoundPaper | undefined, newStage: PaperStage | null, claim: CompanyClaim | null, picked: PickedCompany | null): PaperCompany | null {
  if (paper === undefined || claim === null) return null;
  const roles = requireCompanyRoles(paper, newStage, claim);
  if (picked === null) throw new ToolRefusal(PAPER_CHANGED_ERROR);
  return { ...claim, organizationId: picked.organizationId, roles };
}

export function requireCompanyRoles(paper: FoundPaper, newStage: PaperStage | null, claim: CompanyClaim): CompanyRoles {
  const stage = newStage ?? paper.stage;
  const roles = readCompanyRoles(claim.slot, stage);
  if (roles === null) throw new ToolRefusal(buildNoSuchCompanyError(claim.slot, stage));
  return roles;
}

function buildNoSuchCompanyError(slot: CompanySlot, stage: PaperStage | null): string {
  if (stage === null) return `Chưa biết giấy tờ này là phiếu lấy hàng hay phiếu đổ hàng, nên chưa biết ${SLOT_NAMES[slot]} của nó là công ty nào. Chưa đổi gì. Hỏi quản lý đây là phiếu lấy hàng hay đổ hàng rồi gọi lại với new_stage.`;
  const stageName = stage === 'dispatch' ? 'phiếu lấy hàng' : 'phiếu đổ hàng';
  return `Giấy tờ này là ${stageName}, không có ${SLOT_NAMES[slot]}. Chưa đổi gì. Hỏi lại quản lý muốn sửa công ty nào.`;
}
