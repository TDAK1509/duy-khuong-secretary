export type PendingChoice = { kind: 'workspace_pick'; workspaceIds: string[] };

export type StoredChoice = { kind: 'workspace_pick'; workspace_ids: string[] };

export function toStoredChoice(choice: PendingChoice): StoredChoice {
  return { kind: choice.kind, workspace_ids: choice.workspaceIds };
}
