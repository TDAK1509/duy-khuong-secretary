import { z } from 'zod';
import { addCredits } from '../credits/credit-balance.ts';
import { runInTransaction, type Database } from '../db/transaction.ts';

const CreditsFormSchema = z.object({ request_id: z.string(), workspace_id: z.string(), credits: z.string(), note: z.string() });

export type CreditsForm = { requestId: string; workspaceId: string; credits: string; note: string };

export function readCreditsForm(body: unknown): CreditsForm {
  const form = CreditsFormSchema.parse(body);
  return { requestId: form.request_id, workspaceId: form.workspace_id, credits: form.credits, note: form.note };
}

export function addInternalCredits(database: Database, userId: string, form: CreditsForm): Promise<void> {
  return runInTransaction(database, (transaction) =>
    addCredits(transaction, { id: form.requestId, workspaceId: form.workspaceId, credits: form.credits, source: 'internal_user', addedBy: userId, note: form.note }),
  );
}
