import type { PrintedValue } from '../../documents/corrections/paper-correction.ts';
import { readKilogramsPerUnit } from '../../documents/corrections/weight-units.ts';
import { WEIGHT_MEANING } from '../../facts/fact-value-totals.ts';
import { toAccentFreeForm } from '../../reading/normalize.ts';
import { applyLoadWeightRules, isLoadWeightPrinted, isLoadWeightText } from './load-weight-rules.ts';
import { ToolRefusal } from './tool-result.ts';

export type PrintedArguments = {
  printed_label: string | null;
  printed_value: string | null;
  printed_meaning: string | null;
  printed_number: number | null;
  printed_unit: string | null;
};

type StoredNumber = Pick<PrintedValue, 'number' | 'unit'>;

const OTHER_UNITS: Record<string, string> = { l: 'l', lit: 'l', km: 'km', vnd: 'vnd', d: 'vnd', dong: 'vnd' };

const INCOMPLETE_PRINTED_ERROR = 'Giá trị in trên giấy cần cả printed_label (tên mục in trên giấy) và printed_value (giá trị mới). Gửi lại với đủ cả hai theo đúng lời quản lý.';
const NUMBER_AND_UNIT_ERROR = 'Con số của giá trị cần cả printed_number và printed_unit (đơn vị quản lý gõ). Gửi lại với đủ cả hai, hoặc hỏi quản lý đơn vị nếu quản lý chưa nêu.';
const NUMBER_WITHOUT_MEANING_ERROR = 'Giá trị có con số cần printed_meaning (ý nghĩa của con số, ví dụ "Trọng lượng hàng"). Gửi lại với đủ.';

export function readPrintedValue(args: PrintedArguments): PrintedValue | null {
  const label = args.printed_label?.trim() || null;
  const value = args.printed_value?.trim() || null;
  if (label === null && value === null) return null;
  if (label === null || value === null) throw new ToolRefusal(INCOMPLETE_PRINTED_ERROR);
  const meaning = args.printed_meaning?.trim() || (isLoadWeightText(label) ? WEIGHT_MEANING : null);
  const printed = { label, value, meaning, ...readStoredNumber(args), typedNumber: args.printed_number };
  if (printed.number !== null && meaning === null) throw new ToolRefusal(NUMBER_WITHOUT_MEANING_ERROR);
  return isLoadWeightPrinted(printed) ? applyLoadWeightRules(printed) : printed;
}

function readStoredNumber({ printed_number: number, printed_unit }: PrintedArguments): StoredNumber {
  const unit = printed_unit?.trim() || null;
  if (number === null && unit === null) return { number: null, unit: null };
  if (number === null || unit === null) throw new ToolRefusal(NUMBER_AND_UNIT_ERROR);
  const kilogramsPerUnit = readKilogramsPerUnit(unit);
  if (kilogramsPerUnit === null) return { number, unit: readOtherUnit(unit) };
  return { number: Number((number * kilogramsPerUnit).toFixed(3)), unit: 'kg' };
}

function readOtherUnit(unit: string): string {
  const standardUnit = OTHER_UNITS[toAccentFreeForm(unit) ?? ''];
  if (standardUnit === undefined) throw new ToolRefusal(`Đơn vị "${unit}" không dùng được. Dùng kg, tấn, l, km hoặc vnd theo đúng chữ quản lý gõ.`);
  return standardUnit;
}
