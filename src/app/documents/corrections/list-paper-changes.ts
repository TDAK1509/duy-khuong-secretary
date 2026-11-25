import type { ChangedField, FoundPaper, NewPaperValues, PaperChange } from './paper-correction.ts';

export function listPaperChanges(paper: FoundPaper, values: NewPaperValues): PaperChange[] {
  return [
    ...describeChange('plate', paper.plate, values.plate),
    ...describeChange('number', paper.document_number, values.documentNumber),
    ...describeChange('date', paper.document_date, values.documentDate),
    ...describeChange('stage', paper.stage, values.stage),
  ];
}

function describeChange(field: ChangedField, before: string | null, after: string | null): PaperChange[] {
  return after === null || after === before ? [] : [{ field, before, after }];
}

export function resolveFinalValues(paper: FoundPaper, values: NewPaperValues): Omit<NewPaperValues, 'stage'> {
  return {
    plate: values.plate ?? paper.plate,
    documentNumber: values.documentNumber ?? paper.document_number,
    documentDate: values.documentDate ?? paper.document_date,
  };
}
