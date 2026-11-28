import type { FactCompanySlot } from './pick-fact-companies.ts';

export type KnowledgeCompany = { name: string; matchKey: string; organizationIds: string[] | null };

export type KnowledgeConditions = {
  goods: string | null;
  vehiclePlate: string | null;
  driverUserId: string | null;
  pickup: KnowledgeCompany | null;
  dropoff: KnowledgeCompany | null;
};

export type KnowledgeOutcomes = {
  customer: string | null;
  dropoff: string | null;
  shownGoodsName: string | null;
  wageVnd: number | null;
  ratePerTonVnd: number | null;
  allowanceVnd: number | null;
  note: string | null;
};

export type NewKnowledge = {
  workspaceId: string;
  authorUserId: string;
  statement: string;
  when: KnowledgeConditions;
  then: KnowledgeOutcomes;
};

export type StoredSide = { name: string | null; matchKey: string | null; resolved: boolean; picks: string[] };

export type StoredEntry = {
  id: string;
  statement: string;
  authorName: string | null;
  goods: string | null;
  vehiclePlate: string | null;
  driverUserId: string | null;
  driverName: string | null;
  sides: Record<FactCompanySlot, StoredSide>;
  outcomes: KnowledgeOutcomes;
  linkedDocuments: number;
  updatedAt: Date;
};

export const NO_OUTCOMES: KnowledgeOutcomes = { customer: null, dropoff: null, shownGoodsName: null, wageVnd: null, ratePerTonVnd: null, allowanceVnd: null, note: null };
