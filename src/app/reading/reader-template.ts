import type { ReadAttempt, ReadingItem } from './reading.ts';

export type ReaderTemplateField = { name: string; valueType: 'text' | 'number' | 'date'; unit: string | null; required: boolean };

export type ReaderTemplate = {
  id: string;
  name: string;
  kind: string;
  issuerName: string | null;
  description: string;
  stage: 'dispatch' | 'receipt' | null;
  fields: ReaderTemplateField[];
};

export type ListedTemplate = { shortId: string; template: ReaderTemplate };

const CONTROL_CHARACTERS = /\p{Cc}/gu;

export function listTemplatesWithShortIds(templates: ReaderTemplate[]): ListedTemplate[] {
  return templates.map((template, index) => ({ shortId: `t${index + 1}`, template }));
}

export function describeTemplateForPicker({ shortId, template }: ListedTemplate): Record<string, string | null> {
  return {
    id: shortId,
    name: removeControlCharacters(template.name),
    kind: removeControlCharacters(template.kind),
    issuer: template.issuerName === null ? null : removeControlCharacters(template.issuerName),
    description: removeControlCharacters(template.description),
  };
}

export function describeTemplateForRead(listed: ListedTemplate): Record<string, unknown> {
  const fields = listed.template.fields.map(({ name, valueType, unit }) => ({ name: removeControlCharacters(name), type: valueType, unit }));
  return { ...describeTemplateForPicker(listed), stage: listed.template.stage, fields };
}

export function applyPickedTemplate(attempt: ReadAttempt, picked: ListedTemplate | null): ReadAttempt {
  if (!attempt.ok) return attempt;
  const items = attempt.reading.items.map((item) => applyTemplateToItem(item, picked));
  return { ok: true, reading: { ...attempt.reading, items } };
}

function applyTemplateToItem(item: ReadingItem, picked: ListedTemplate | null): ReadingItem {
  if (picked === null || item.template !== picked.shortId) return { ...item, template: null };
  const { template } = picked;
  return { ...item, template: template.id, document_kind: template.kind, stage: template.stage ?? item.stage };
}

function removeControlCharacters(text: string): string {
  return text.replace(CONTROL_CHARACTERS, ' ');
}
