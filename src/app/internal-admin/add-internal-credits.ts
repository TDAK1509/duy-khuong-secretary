import { z } from 'zod';
import { addCredits } from '../credits/credit-balance.ts';
import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { findInternalSessionUserInTransaction } from './find-internal-session-user.ts';
import { findWorkspaceName } from './find-workspace-name.ts';
import { CREDITS_INVALID_TEXT, NOTE_INVALID_TEXT, WORKSPACE_NOT_FOUND_TEXT } from './internal-admin-texts.ts';

const MAX_CREDITS = 1_000_000;
const MAX_NOTE_LENGTH = 500;
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

export type CreditsSession = { token: string; now: Date };

export type CreditsOutcome = { kind: 'added' } | { kind: 'refused'; text: string } | { kind: 'no_session' };

type ValidAddition = { id: string; workspaceId: string; credits: string; note: string };

export function readCreditsForm(body: unknown): CreditsForm {
  const form = CreditsFormSchema.catch(EMPTY_FORM).parse(body);
  return { csrf: form.csrf, requestId: form.request_id, workspaceId: form.workspace_id, credits: form.credits, note: form.note };
}

export async function addInternalCredits(database: Database, session: CreditsSession, form: CreditsForm): Promise<CreditsOutcome> {
  const credits = readCredits(form.credits);
  if (credits === null) return { kind: 'refused', text: CREDITS_INVALID_TEXT };
  const note = readNote(form.note);
  if (note === null) return { kind: 'refused', text: NOTE_INVALID_TEXT };
  if ((await findWorkspaceName(database, form.workspaceId)) === null) return { kind: 'refused', text: WORKSPACE_NOT_FOUND_TEXT };
  const addition = { id: form.requestId, workspaceId: form.workspaceId, credits, note };
  return runInTransaction(database, (transaction) => addIfSessionIsLive(transaction, session, addition));
}

async function addIfSessionIsLive(transaction: Transaction, session: CreditsSession, addition: ValidAddition): Promise<CreditsOutcome> {
  await transaction.query('SELECT 1 FROM workspaces WHERE id = $1 FOR UPDATE', [addition.workspaceId]);
  const userId = await findInternalSessionUserInTransaction(transaction, session.token, session.now);
  if (userId === null) return { kind: 'no_session' };
  await addCredits(transaction, { ...addition, source: 'internal_user', addedBy: userId });
  return { kind: 'added' };
}

function readCredits(text: string): string | null {
  const credits = text.trim();
  const isInRange = Number(credits) >= 1 && Number(credits) <= MAX_CREDITS;
  return WHOLE_NUMBER.test(credits) && isInRange ? credits : null;
}

function readNote(text: string): string | null {
  const note = text.trim();
  return note.length >= 1 && note.length <= MAX_NOTE_LENGTH ? note : null;
}
