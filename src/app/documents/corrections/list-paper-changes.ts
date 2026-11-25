import { COMPANY_SLOT_LABELS } from './company-roles.ts';
import type { CompanyTarget } from './company-target.ts';
import type { PrintedLine } from './find-printed-line.ts';
import type { ChangedField, FoundPaper, NewPaperValues, PaperChange, PaperCompany, PrintedValue } from './paper-correction.ts';

export type ValuesBefore = { printed: PrintedLine | null; company: CompanyTarget | null };

export function listPaperChanges(paper: FoundPaper, values: NewPaperValues, before: ValuesBefore): PaperChange[] {
  return [
    ...describeChange('plate', paper.plate, values.plate),
    ...describeChange('number', paper.document_number, values.documentNumber),
    ...describeChange('date', paper.document_date, values.documentDate),
    ...describeChange('stage', paper.stage, values.stage),
    ...describePrintedChange(before.printed, values.printed),
    ...describeCompanyChange(before.company, values.company),
  ];
}

function describeChange(field: ChangedField, before: string | null, after: string | null): PaperChange[] {
  return after === null || after === before ? [] : [{ field, label: null, before, after }];
}

function describePrintedChange(before: PrintedLine | null, printed: PrintedValue | null): PaperChange[] {
  if (printed === null || isPrintedLineRight(before, printed)) return [];
  return [{ field: 'printed_value', label: printed.label, before: before?.value ?? null, after: printed.value }];
}

function describeCompanyChange(target: CompanyTarget | null, company: PaperCompany | null): PaperChange[] {
  if (target === null || company === null) return [];
  return [{ field: 'company', label: COMPANY_SLOT_LABELS[company.slot], before: target.replacedNames, after: target.organization.name }];
}

function isPrintedLineRight(line: PrintedLine | null, printed: PrintedValue): boolean {
  if (line === null) return false;
  const lineNumber = line.number === null ? null : Number(line.number);
  return line.value === printed.value && lineNumber === printed.number && line.unit === printed.unit;
}

export function resolveFinalValues(paper: FoundPaper, values: NewPaperValues): Pick<NewPaperValues, 'plate' | 'documentNumber' | 'documentDate'> {
  return {
    plate: values.plate ?? paper.plate,
    documentNumber: values.documentNumber ?? paper.document_number,
    documentDate: values.documentDate ?? paper.document_date,
  };
}
