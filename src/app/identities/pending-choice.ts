import { z } from 'zod';

export type PendingChoice = { kind: 'workspace_pick'; workspaceIds: string[] };

export type StoredChoice = { kind: 'workspace_pick'; workspace_ids: string[] };

const storedChoiceSchema = z
  .object({ kind: z.literal('workspace_pick'), workspace_ids: z.array(z.string()) })
  .transform((stored): PendingChoice => ({ kind: stored.kind, workspaceIds: stored.workspace_ids }));

export function toStoredChoice(choice: PendingChoice): StoredChoice {
  return { kind: choice.kind, workspace_ids: choice.workspaceIds };
}

export function readStoredChoice(stored: unknown): PendingChoice | null {
  return stored === null ? null : storedChoiceSchema.parse(stored);
}

export function isBareNumber(text: string): boolean {
  return /^\d{1,2}$/.test(text.trim());
}
