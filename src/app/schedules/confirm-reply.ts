import type { PendingChoice } from '../identities/pending-choice.ts';
import { toAccentFreeForm } from '../reading/normalize.ts';

export type ConfirmAction = 'save' | 'cancel';

const SAVE_ANSWERS = ['1', 'luu', 'luu lich'];
const CANCEL_ANSWERS = ['2', 'huy', 'huy lich'];

export function readConfirmReply(text: string): ConfirmAction | null {
  const answer = (toAccentFreeForm(text) ?? '').replace(/[.!]+$/, '').trim();
  if (SAVE_ANSWERS.includes(answer)) return 'save';
  return CANCEL_ANSWERS.includes(answer) ? 'cancel' : null;
}

export function isConfirmReplyTo(choice: PendingChoice | null, text: string): boolean {
  return choice?.kind === 'draft_confirm' && readConfirmReply(text) !== null;
}
