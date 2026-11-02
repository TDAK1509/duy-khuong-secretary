import { z } from 'zod';

export type PendingChoice =
  | { kind: 'workspace_pick'; workspaceIds: string[] }
  | { kind: 'draft_confirm'; taskId: string; workspaceId: string };

export type StoredChoice =
  | { kind: 'workspace_pick'; workspace_ids: string[] }
  | { kind: 'draft_confirm'; task_id: string; workspace_id: string };

const storedWorkspacePickSchema = z
  .object({ kind: z.literal('workspace_pick'), workspace_ids: z.array(z.string()) })
  .transform((stored): PendingChoice => ({ kind: stored.kind, workspaceIds: stored.workspace_ids }));

const storedDraftConfirmSchema = z
  .object({ kind: z.literal('draft_confirm'), task_id: z.string(), workspace_id: z.string() })
  .transform((stored): PendingChoice => ({ kind: stored.kind, taskId: stored.task_id, workspaceId: stored.workspace_id }));

const storedChoiceSchema = z.union([storedWorkspacePickSchema, storedDraftConfirmSchema]);

export function toStoredChoice(choice: PendingChoice): StoredChoice {
  if (choice.kind === 'workspace_pick') return { kind: choice.kind, workspace_ids: choice.workspaceIds };
  return { kind: choice.kind, task_id: choice.taskId, workspace_id: choice.workspaceId };
}

export function readStoredChoice(stored: unknown): PendingChoice | null {
  return stored === null ? null : storedChoiceSchema.parse(stored);
}

export function isBareNumber(text: string): boolean {
  return /^\d{1,2}$/.test(text.trim());
}
