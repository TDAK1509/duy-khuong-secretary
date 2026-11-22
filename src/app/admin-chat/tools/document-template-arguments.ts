import { z } from 'zod';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import { MAX_FIELDS_PER_TEMPLATE, type TemplateField } from '../../document-templates/document-template.ts';
import { STANDARD_UNITS } from '../../reading/reading.ts';
import { refuseInvalidArgument, ToolRefusal } from './tool-result.ts';

const MAX_NAME_LENGTH = 80;
const MAX_KIND_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 200;
const MAX_FIELD_NAME_LENGTH = 60;

export const fieldArgumentSchema = z.strictObject({
  name: z.string(),
  type: z.enum(['text', 'number', 'date']),
  unit: z.enum(STANDARD_UNITS).nullable(),
  required: z.boolean(),
});

export type FieldArgument = z.infer<typeof fieldArgumentSchema>;

export function readTemplateName(raw: string): { name: string; nameKey: string } {
  const name = readLimitedText(raw, MAX_NAME_LENGTH, 'name');
  return { name, nameKey: readMatchKey(name, 'name') };
}

export function readTemplateKind(raw: string): string {
  return readLimitedText(raw, MAX_KIND_LENGTH, 'kind');
}

export function readTemplateDescription(raw: string): string {
  const description = raw.trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) refuseInvalidArgument('description');
  return description;
}

export function readTemplateFields(raw: FieldArgument[]): TemplateField[] {
  if (raw.length > MAX_FIELDS_PER_TEMPLATE) throw new ToolRefusal(`Mỗi mẫu có tối đa ${MAX_FIELDS_PER_TEMPLATE} trường.`);
  const fields = raw.map(readTemplateField);
  const duplicate = fields.find((field, index) => fields.findIndex((other) => other.valueType === field.valueType && other.nameKey === field.nameKey) !== index);
  if (duplicate !== undefined) throw new ToolRefusal(`Trường "${duplicate.name}" bị trùng. Mỗi trường chỉ ghi một lần.`);
  return fields;
}

function readTemplateField({ name: rawName, type, unit, required }: FieldArgument): TemplateField {
  const name = readLimitedText(rawName, MAX_FIELD_NAME_LENGTH, 'fields.name');
  if (unit !== null && type !== 'number') throw new ToolRefusal(`Trường "${name}" không phải kiểu số nên không có đơn vị.`);
  return { name, nameKey: readMatchKey(name, 'fields.name'), valueType: type, unit, required };
}

function readLimitedText(raw: string, maxLength: number, field: string): string {
  const text = raw.trim();
  if (text === '' || text.length > maxLength) refuseInvalidArgument(field);
  return text;
}

function readMatchKey(text: string, field: string): string {
  const matchKey = buildMatchKey(text);
  if (matchKey === '') refuseInvalidArgument(field);
  return matchKey;
}
