import type { CompanySlot } from '../../facts/pick-fact-companies.ts';
import type { CompanyRoles, PaperStage } from './paper-correction.ts';

export const COMPANY_SLOT_LABELS: Record<CompanySlot, string> = { pickup: 'Nơi lấy hàng', dropoff: 'Nơi đổ hàng', customer: 'Khách hàng' };

const CUSTOMER_ROLES: CompanyRoles = { assigned: 'customer', replaced: ['customer'] };
const PICKUP_ROLES: CompanyRoles = { assigned: 'issuer', replaced: ['issuer', 'place', 'supplier'] };
const DROPOFF_ROLES: CompanyRoles = { assigned: 'issuer', replaced: ['issuer', 'place'] };

export function readCompanyRoles(slot: CompanySlot, stage: PaperStage | null): CompanyRoles | null {
  if (slot === 'customer') return CUSTOMER_ROLES;
  if (slot === 'pickup' && stage === 'dispatch') return PICKUP_ROLES;
  if (slot === 'dropoff' && stage === 'receipt') return DROPOFF_ROLES;
  return null;
}
