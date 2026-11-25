import { readCompanyRoles } from '../../documents/corrections/company-roles.ts';
import type { FoundPaper, PaperCompany, PaperStage } from '../../documents/corrections/paper-correction.ts';
import type { CompanySlot } from '../../facts/pick-fact-companies.ts';
import type { ChosenCompany } from './choose-paper-company.ts';
import { ToolRefusal } from './tool-result.ts';

const SLOT_NAMES: Record<CompanySlot, string> = { pickup: 'nơi lấy hàng', dropoff: 'nơi đổ hàng', customer: 'khách hàng' };

export function settleCompany(paper: FoundPaper | undefined, newStage: PaperStage | null, chosen: ChosenCompany | null): PaperCompany | null {
  if (paper === undefined || chosen === null) return null;
  const stage = newStage ?? paper.stage;
  const roles = readCompanyRoles(chosen.claim.slot, stage);
  if (roles === null) throw new ToolRefusal(buildNoSuchCompanyError(chosen.claim.slot, stage));
  return { ...chosen.claim, organizationId: chosen.organizationId, roles };
}

function buildNoSuchCompanyError(slot: CompanySlot, stage: PaperStage | null): string {
  if (stage === null) return `Chưa biết giấy tờ này là phiếu lấy hàng hay phiếu đổ hàng, nên chưa biết ${SLOT_NAMES[slot]} của nó là công ty nào. Chưa đổi gì. Hỏi quản lý đây là phiếu lấy hàng hay đổ hàng rồi gọi lại với new_stage.`;
  const stageName = stage === 'dispatch' ? 'phiếu lấy hàng' : 'phiếu đổ hàng';
  return `Giấy tờ này là ${stageName}, không có ${SLOT_NAMES[slot]}. Chưa đổi gì. Hỏi lại quản lý muốn sửa công ty nào.`;
}
