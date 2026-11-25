import type { Transaction } from '../../db/transaction.ts';
import type { CompanySlot } from '../../facts/pick-fact-companies.ts';

export type PaperCorrector = { transaction: Transaction; workspaceId: string; now: Date };

export type PaperStage ='dispatch' | 'receipt';

export type NewPaperValues = {
  plate: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  stage: PaperStage | null;
  printed: PrintedValue | null;
  company: PaperCompany | null;
};

export type CompanyClaim = { slot: CompanySlot; name: string };

export type CompanyRoles = { assigned: 'issuer' | 'customer'; replaced: string[] };

export type PaperCompany = CompanyClaim & { organizationId: string | null; roles: CompanyRoles };

export type PrintedValue = {
  label: string;
  value: string;
  meaning: string | null;
  number: number | null;
  unit: string | null;
  typedNumber: number | null;
};

export type PaperPointer = {
  plate: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  lastPhotoMessageId: string | null;
};

export type FoundPaper = {
  id: string;
  kind: string;
  title: string | null;
  document_number: string | null;
  document_date: string | null;
  plate: string | null;
  stage: PaperStage | null;
  sender: string | null;
  sent_at: string;
};

export type ChangedField = 'plate' | 'number' | 'date' | 'stage' | 'printed_value' | 'company';

export type PaperChange = { field: ChangedField; label: string | null; before: string | null; after: string };

export type CorrectedPaper = { paper: FoundPaper; changes: PaperChange[]; mergedIntoId: string | null };
