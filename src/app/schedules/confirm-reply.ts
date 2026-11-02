import type { PendingChoice } from '../identities/pending-choice.ts';
import { toAccentFreeForm } from '../reading/normalize.ts';

export type ConfirmAction = 'save';

const SAVE_ANSWERS = ['1', 'luu', 'luu lich'];

export function readConfirmReply(text: string): ConfirmAction | null {
  const answer = (toAccentFreeForm(text) ?? '').replace(/[.!]+$/, '').trim();
  return SAVE_ANSWERS.includes(answer) ? 'save' : null;
}

export function isConfirmReplyTo(choice: PendingChoice | null, text: string): boolean {
  return choice?.kind === 'draft_confirm' && readConfirmReply(text) !== null;
}
