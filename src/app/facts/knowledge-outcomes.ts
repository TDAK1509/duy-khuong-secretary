import type { KnowledgeOutcomes } from './company-knowledge.ts';

export const PER_TRIP_UNIT = 'đ';
export const PER_TON_UNIT = 'đ/tấn';

export type OutcomeDefinition = {
  key: keyof KnowledgeOutcomes;
  name: string;
  matchKey: string;
  column: string;
  unit: string | null;
};

export const OUTCOME_DEFINITIONS: readonly OutcomeDefinition[] = [
  { key: 'customer', name: 'Khách hàng', matchKey: 'khachhang', column: 'then_customer', unit: null },
  { key: 'dropoff', name: 'Nơi đổ hàng', matchKey: 'noidohang', column: 'then_dropoff', unit: null },
  { key: 'wageVnd', name: 'Lương tài xế', matchKey: 'luongtaixe', column: 'then_wage_vnd', unit: PER_TRIP_UNIT },
  { key: 'ratePerTonVnd', name: 'Cước vận chuyển', matchKey: 'cuocvanchuyen', column: 'then_rate_vnd_per_ton', unit: PER_TON_UNIT },
  { key: 'allowanceVnd', name: 'Chi phí bồi dưỡng', matchKey: 'chiphiboiduong', column: 'then_allowance_vnd', unit: PER_TRIP_UNIT },
  { key: 'note', name: 'Ghi chú', matchKey: 'ghichu', column: 'then_note', unit: null },
];

export const AMOUNT_OUTCOME_NAMES: readonly string[] = OUTCOME_DEFINITIONS.filter((outcome) => outcome.unit !== null).map((outcome) => outcome.name);

export function buildOutcomeRowsSql(entry: string): string {
  return OUTCOME_DEFINITIONS.map((outcome, position) => buildOutcomeRowSql(entry, outcome, position)).join('\n    UNION ALL ');
}

function buildOutcomeRowSql(entry: string, { name, matchKey, column, unit }: OutcomeDefinition, position: number): string {
  const number = unit === null ? 'NULL::numeric' : `${entry}.${column}`;
  const text = unit === null ? `${entry}.${column}` : 'NULL::text';
  const printedUnit = unit === null ? 'NULL::text' : `'${unit}'`;
  return `SELECT ${position} AS position, '${matchKey}' AS match_key, '${name}' AS name, ${number} AS number, ${printedUnit} AS unit, ${text} AS text_value WHERE ${entry}.${column} IS NOT NULL`;
}
