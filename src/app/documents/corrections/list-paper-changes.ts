import type { PrintedLine } from './find-printed-line.ts';
import type { ChangedField, FoundPaper, NewPaperValues, PaperChange, PrintedValue } from './paper-correction.ts';

export function listPaperChanges(paper: FoundPaper, values: NewPaperValues, printedBefore: PrintedLine | null): PaperChange[] {
  return [
    ...describeChange('plate', paper.plate, values.plate),
    ...describeChange('number', paper.document_number, values.documentNumber),
    ...describeChange('date', paper.document_date, values.documentDate),
    ...describeChange('stage', paper.stage, values.stage),
    ...describePrintedChange(printedBefore, values.printed),
  ];
}

function describeChange(field: ChangedField, before: string | null, after: string | null): PaperChange[] {
  return after === null || after === before ? [] : [{ field, label: null, before, after }];
}

function describePrintedChange(before: PrintedLine | null, printed: PrintedValue | null): PaperChange[] {
  if (printed === null || isPrintedLineRight(before, printed)) return [];
  return [{ field: 'printed_value', label: printed.label, before: before?.value ?? null, after: printed.value }];
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
