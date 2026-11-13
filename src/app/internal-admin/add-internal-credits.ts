import { z } from 'zod';
import { addCredits } from '../credits/credit-balance.ts';
import { runInTransaction, type Database } from '../db/transaction.ts';

const CreditsFormSchema = z.object({
  csrf: z.string().catch(''),
  request_id: z.string().catch(''),
  workspace_id: z.string().catch(''),
  credits: z.string().catch(''),
  note: z.string().catch(''),
});

export type CreditsForm = { csrf: string; requestId: string; workspaceId: string; credits: string; note: string };

export function readCreditsForm(body: unknown): CreditsForm {
  const form = CreditsFormSchema.catch({ csrf: '', request_id: '', workspace_id: '', credits: '', note: '' }).parse(body);
  return { csrf: form.csrf, requestId: form.request_id, workspaceId: form.workspace_id, credits: form.credits, note: form.note };
}

export function addInternalCredits(database: Database, userId: string, form: CreditsForm): Promise<void> {
  return runInTransaction(database, (transaction) =>
    addCredits(transaction, { id: form.requestId, workspaceId: form.workspaceId, credits: form.credits, source: 'internal_user', addedBy: userId, note: form.note }),
  );
}
