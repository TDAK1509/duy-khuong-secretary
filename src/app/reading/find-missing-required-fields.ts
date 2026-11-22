import { buildMatchKey } from '../documents/build-match-key.ts';
import type { ReadingDetail } from './reading.ts';
import type { ReaderTemplate, ReaderTemplateField } from './reader-template.ts';

export function findMissingRequiredFields(template: ReaderTemplate, details: ReadingDetail[]): string[] {
  return template.fields.filter((field) => field.required && !details.some((detail) => hasFieldValue(detail, field))).map(({ name }) => name);
}

function hasFieldValue(detail: ReadingDetail, field: ReaderTemplateField): boolean {
  return isNamedAfter(detail, field) && hasValueOfType(detail, field.valueType);
}

function isNamedAfter(detail: ReadingDetail, { name, valueType }: ReaderTemplateField): boolean {
  const fieldKey = buildMatchKey(name);
  if (buildMatchKey(detail.label) === fieldKey) return true;
  return valueType !== 'text' && detail.meaning !== null && buildMatchKey(detail.meaning) === fieldKey;
}

function hasValueOfType(detail: ReadingDetail, valueType: ReaderTemplateField['valueType']): boolean {
  if (valueType === 'number') return detail.line_number !== null;
  if (valueType === 'date') return (detail.date_time ?? '').trim() !== '';
  return detail.value.trim() !== '';
}
