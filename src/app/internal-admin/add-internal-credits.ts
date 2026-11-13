import { z } from 'zod';
import { addCredits } from '../credits/credit-balance.ts';
import { runInTransaction, type Database } from '../db/transaction.ts';
import { CREDITS_INVALID_TEXT } from './internal-admin-texts.ts';

const MAX_CREDITS = 1_000_000;
const WHOLE_NUMBER = /^\d+$/;

const EMPTY_FORM = { csrf: '', request_id: '', workspace_id: '', credits: '', note: '' };
const CreditsFormSchema = z.object({
  csrf: z.string().catch(''),
  request_id: z.string().catch(''),
  workspace_id: z.string().catch(''),
  credits: z.string().catch(''),
  note: z.string().catch(''),
});

export type CreditsForm = { csrf: string; requestId: string; workspaceId: string; credits: string; note: string };

export type CreditsOutcome = { kind: 'added' } | { kind: 'refused'; text: string };

export function readCreditsForm(body: unknown): CreditsForm {
  const form = CreditsFormSchema.catch(EMPTY_FORM).parse(body);
  return { csrf: form.csrf, requestId: form.request_id, workspaceId: form.workspace_id, credits: form.credits, note: form.note };
}

export async function addInternalCredits(database: Database, userId: string, form: CreditsForm): Promise<CreditsOutcome> {
  const credits = readCredits(form.credits);
  if (credits === null) return { kind: 'refused', text: CREDITS_INVALID_TEXT };
  await runInTransaction(database, (transaction) =>
    addCredits(transaction, { id: form.requestId, workspaceId: form.workspaceId, credits, source: 'internal_user', addedBy: userId, note: form.note }),
  );
  return { kind: 'added' };
}

function readCredits(text: string): string | null {
  const credits = text.trim();
  const isInRange = Number(credits) >= 1 && Number(credits) <= MAX_CREDITS;
  return WHOLE_NUMBER.test(credits) && isInRange ? credits : null;
}
