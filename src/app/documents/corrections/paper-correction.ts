import type { Transaction } from '../../db/transaction.ts';

export type PaperCorrector = { transaction: Transaction; workspaceId: string; now: Date };

export type PaperStage ='dispatch' | 'receipt';

export type NewPaperValues = {
  plate: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  stage: PaperStage | null;
  printed: PrintedValue | null;
};

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

export type ChangedField = 'plate' | 'number' | 'date' | 'stage' | 'printed_value';

export type PaperChange = { field: ChangedField; label: string | null; before: string | null; after: string };

export type CorrectedPaper = { paper: FoundPaper; changes: PaperChange[]; mergedIntoId: string | null };
