import { toAccentFreeForm } from '../reading/normalize.ts';

export function buildMatchKey(printedName: string): string {
  return (toAccentFreeForm(printedName) ?? '').replace(/[^a-z0-9]/g, '');
}
