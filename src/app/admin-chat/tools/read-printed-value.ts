import type { PrintedValue } from '../../documents/corrections/paper-correction.ts';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import { WEIGHT_MEANING } from '../../facts/total-fact-values.ts';
import { toAccentFreeForm } from '../../reading/normalize.ts';
import { ToolRefusal } from './tool-result.ts';

export type PrintedArguments = {
  printed_label: string | null;
  printed_value: string | null;
  printed_meaning: string | null;
  printed_number: number | null;
  printed_unit: string | null;
};

const KG_PER_TON = 1000;
const MAX_LOAD_WEIGHT_KG = 100 * KG_PER_TON;
const TON_UNITS = ['t', 'tan', 'ton', 'tons'];

const INCOMPLETE_PRINTED_ERROR = 'Giá trị in trên giấy cần cả printed_label (tên mục in trên giấy) và printed_value (giá trị mới). Gửi lại với đủ cả hai theo đúng lời quản lý.';
const NUMBER_WITHOUT_MEANING_ERROR = 'Giá trị có con số cần cả printed_meaning (ý nghĩa của con số, ví dụ "Trọng lượng hàng") và printed_unit (đơn vị). Gửi lại với đủ cả hai.';

export function readPrintedValue(args: PrintedArguments): PrintedValue | null {
  const label = args.printed_label?.trim() || null;
  const value = args.printed_value?.trim() || null;
  if (label === null && value === null) return null;
  if (label === null || value === null) throw new ToolRefusal(INCOMPLETE_PRINTED_ERROR);
  const meaning = args.printed_meaning?.trim() || null;
  const unit = args.printed_unit?.trim() || null;
  if (args.printed_number !== null && (meaning === null || unit === null)) throw new ToolRefusal(NUMBER_WITHOUT_MEANING_ERROR);
  const printed = { label, value, meaning, ...convertTonsToKg(args.printed_number, unit), typedNumber: args.printed_number };
  refuseImpossibleLoad(printed);
  return printed;
}

function convertTonsToKg(number: number | null, unit: string | null): { number: number | null; unit: string | null } {
  if (number === null || !TON_UNITS.includes(toAccentFreeForm(unit) ?? '')) return { number, unit };
  return { number: Number((number * KG_PER_TON).toFixed(3)), unit: 'kg' };
}

function refuseImpossibleLoad({ label, meaning, number, unit }: PrintedValue): void {
  const isLoadWeight = [label, meaning].some((text) => buildMatchKey(text ?? '') === buildMatchKey(WEIGHT_MEANING));
  if (!isLoadWeight || unit !== 'kg' || number === null || number <= MAX_LOAD_WEIGHT_KG) return;
  throw new ToolRefusal(`Chưa đổi gì: trọng lượng hàng ${number} kg lớn hơn 100 tấn, không thể là tải trọng thật của một chuyến. Hỏi quản lý trọng lượng đúng rồi gọi lại.`);
}
