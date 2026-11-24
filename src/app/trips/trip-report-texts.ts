import { INFERRED_TEXT } from '../documents/format-workbook-sheet.ts';
import type { PairMethod } from './pair-trips.ts';

export const NO_NUMBER = '(không số)';

const PAIRING_TEXTS = { ai: INFERRED_TEXT, rule: 'Khớp trọng lượng', unpaired: 'Không ghép được đơn' } as const;

export function describePairingMethod(method: PairMethod | null): string {
  return method === null ? PAIRING_TEXTS.unpaired : PAIRING_TEXTS[method];
}
