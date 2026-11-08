import { z } from 'zod';

export type NamePair = { matchKey: string; organizationId: string; printedName: string };

export type PendingChoice =
  | { kind: 'workspace_pick'; workspaceIds: string[] }
  | { kind: 'name_match'; workspaceId: string; pairs: NamePair[] };

export type StoredChoice =
  | { kind: 'workspace_pick'; workspace_ids: string[] }
  | { kind: 'name_match'; workspace_id: string; pairs: { match_key: string; organization_id: string; printed_name: string }[] };

const storedKindSchema = z.object({ kind: z.string() });

const storedWorkspacePickSchema = z
  .object({ kind: z.literal('workspace_pick'), workspace_ids: z.array(z.string()) })
  .transform((stored): PendingChoice => ({ kind: stored.kind, workspaceIds: stored.workspace_ids }));

const storedNameMatchSchema = z
  .object({
    kind: z.literal('name_match'),
    workspace_id: z.string(),
    pairs: z.array(z.object({ match_key: z.string(), organization_id: z.string(), printed_name: z.string() })),
  })
  .transform(
    (stored): PendingChoice => ({
      kind: stored.kind,
      workspaceId: stored.workspace_id,
      pairs: stored.pairs.map((pair) => ({ matchKey: pair.match_key, organizationId: pair.organization_id, printedName: pair.printed_name })),
    }),
  );

export function toStoredChoice(choice: PendingChoice): StoredChoice {
  if (choice.kind === 'workspace_pick') return { kind: choice.kind, workspace_ids: choice.workspaceIds };
  const pairs = choice.pairs.map((pair) => ({ match_key: pair.matchKey, organization_id: pair.organizationId, printed_name: pair.printedName }));
  return { kind: choice.kind, workspace_id: choice.workspaceId, pairs };
}

export function readStoredChoice(stored: unknown): PendingChoice | null {
  const kind = storedKindSchema.safeParse(stored);
  if (!kind.success) return null;
  if (kind.data.kind === 'workspace_pick') return storedWorkspacePickSchema.parse(stored);
  if (kind.data.kind === 'name_match') return storedNameMatchSchema.parse(stored);
  return null;
}

export function isBareNumber(text: string): boolean {
  return /^\d{1,2}$/.test(text.trim());
}
