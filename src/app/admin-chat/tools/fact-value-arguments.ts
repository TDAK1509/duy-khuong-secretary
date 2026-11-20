import { z } from 'zod';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import { CUSTOMER_VALUE_KEY, CUSTOMER_VALUE_NAME, type FactCompany, type FactValue, type FactValueContent } from '../../facts/fact.ts';

const MAX_VALUE_NAME_LENGTH = 80;
const PER_TRIP_UNIT = 'đ';
const PER_TON_UNIT = 'đ/tấn';
const MONEY = '(đ|vnd|vnđ|đồng|dong)';
const PER_TRIP_FORM = new RegExp(`^${MONEY}(/(chuyến|chuyen|lượt|luot|xe))?$`);
const PER_TON_FORM = new RegExp(`^${MONEY}/(tấn|tan)$`);

const INVALID_VALUE_NAME_REASON = 'Tên giá trị phải có từ 1 đến 80 ký tự và có chữ hoặc số.';
const DUPLICATE_VALUE_NAME_REASON = 'Trùng tên với một giá trị khác trong cùng thông tin.';
const INVALID_VALUE_KIND_REASON = 'Giá trị phải là một số kèm đơn vị, hoặc là chữ, không phải cả hai.';
const NEGATIVE_NUMBER_REASON = 'Số tiền phải lớn hơn hoặc bằng 0.';

export const valueArgumentSchema = z.strictObject({
  name: z.string(),
  number: z.number().nullable(),
  unit: z.string().nullable(),
  text: z.string().nullable(),
});

type ValueArgument = z.infer<typeof valueArgumentSchema>;
export type RefusedValue = { name: string; reason: string };

export function splitSavedFromRefused(values: ValueArgument[]): { saved: FactValue[]; refused: RefusedValue[] } {
  const saved: FactValue[] = [];
  const refused: RefusedValue[] = [];
  for (const value of values) {
    const reason = findRefusalReason(value, saved);
    if (reason === null) saved.push(toFactValue(value));
    else refused.push({ name: value.name, reason });
  }
  return { saved, refused };
}

function findRefusalReason(value: ValueArgument, saved: FactValue[]): string | null {
  const name = value.name.trim();
  const matchKey = buildMatchKey(name);
  if (matchKey === '' || name.length > MAX_VALUE_NAME_LENGTH) return INVALID_VALUE_NAME_REASON;
  if (saved.some((other) => other.matchKey === matchKey)) return DUPLICATE_VALUE_NAME_REASON;
  return findContentRefusalReason(value);
}

function findContentRefusalReason({ number, unit, text }: ValueArgument): string | null {
  const hasText = text !== null && text.trim() !== '';
  const hasNumber = number !== null;
  if (hasText === hasNumber || hasNumber !== (unit !== null)) return INVALID_VALUE_KIND_REASON;
  if (number === null) return null;
  if (readMoneyUnit(unit) === null) return describeInvalidUnit(unit ?? '');
  return number >= 0 && Number.isFinite(number) ? null : NEGATIVE_NUMBER_REASON;
}

function describeInvalidUnit(unit: string): string {
  return `Đơn vị "${unit}" chưa hợp lệ. Ghi số tiền đầy đủ bằng đồng, kèm "đ" cho số tiền mỗi chuyến (ví dụ 50k/chuyến là 50000 "đ") hoặc "đ/tấn" cho số tiền mỗi tấn (ví dụ 105k/tấn là 105000 "đ/tấn").`;
}

function readMoneyUnit(unit: string | null): string | null {
  const form = (unit ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, '');
  if (PER_TRIP_FORM.test(form)) return PER_TRIP_UNIT;
  return PER_TON_FORM.test(form) ? PER_TON_UNIT : null;
}

function toFactValue(value: ValueArgument): FactValue {
  const name = value.name.trim();
  return { name, matchKey: buildMatchKey(name), content: readContent(value) };
}

function readContent({ number, unit, text }: ValueArgument): FactValueContent {
  if (number !== null && unit !== null) return { kind: 'number', number, unit: readMoneyUnit(unit) ?? PER_TRIP_UNIT };
  return { kind: 'text', text: (text ?? '').trim() };
}

export function describeFactValue({ name, content }: FactValue): Record<string, string | number> {
  if (content.kind === 'number') return { name, number: content.number, unit: content.unit };
  return { name, text: content.text };
}

export function addCustomerValue(values: FactValue[], customer: FactCompany | null): FactValue[] {
  if (customer === null || values.some((value) => value.matchKey === CUSTOMER_VALUE_KEY)) return values;
  return [...values, { name: CUSTOMER_VALUE_NAME, matchKey: CUSTOMER_VALUE_KEY, content: { kind: 'text', text: customer.name } }];
}
