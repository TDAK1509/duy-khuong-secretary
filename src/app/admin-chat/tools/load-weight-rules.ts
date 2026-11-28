import { buildMatchKey } from '../../documents/build-match-key.ts';
import type { PrintedValue } from '../../documents/corrections/paper-correction.ts';
import { formatKilograms } from '../../documents/corrections/weight-units.ts';
import { WEIGHT_MEANING } from '../../facts/knowledge-totals.ts';
import { ToolRefusal } from './tool-result.ts';

const MAX_LOAD_WEIGHT_KG = 100_000;

const WEIGHT_NEEDS_NUMBER_ERROR = 'Trọng lượng hàng cần một con số và đơn vị kg hoặc tấn quản lý đã gõ. Chưa đổi gì. Hỏi quản lý trọng lượng và đơn vị đúng rồi gọi lại.';

export function isLoadWeightPrinted({ label, meaning }: PrintedValue): boolean {
  return isLoadWeightText(label) || isLoadWeightText(meaning);
}

export function isLoadWeightText(text: string | null): boolean {
  return isLoadWeightKey(buildMatchKey(text ?? ''));
}

export function isLoadWeightKey(matchKey: string | null): boolean {
  return matchKey === buildMatchKey(WEIGHT_MEANING);
}

export function applyLoadWeightRules(printed: PrintedValue): PrintedValue {
  if (printed.number === null || printed.unit !== 'kg') throw new ToolRefusal(WEIGHT_NEEDS_NUMBER_ERROR);
  if (printed.number > MAX_LOAD_WEIGHT_KG) throw new ToolRefusal(`Chưa đổi gì: trọng lượng hàng ${printed.number} kg lớn hơn 100 tấn, không thể là tải trọng thật của một chuyến. Hỏi quản lý trọng lượng đúng rồi gọi lại.`);
  return { ...printed, meaning: WEIGHT_MEANING, value: formatKilograms(printed.number) };
}
