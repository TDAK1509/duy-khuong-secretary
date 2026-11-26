import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { listWorkspaceTables } from './list-workspace-tables.ts';

export type WorkspaceSnapshot = Record<string, unknown[]>;

export async function snapshotWorkspace(owner: PostgresPool, workspaceId: string): Promise<WorkspaceSnapshot> {
  const snapshot: WorkspaceSnapshot = { workspaces: await readRows(owner, { table: 'workspaces', workspaceColumn: 'id', workspaceId }) };
  for (const { name } of await listWorkspaceTables(owner)) {
    snapshot[name] = await readRows(owner, { table: name, workspaceColumn: 'workspace_id', workspaceId });
  }
  return snapshot;
}

export function listAddedRows(before: WorkspaceSnapshot, after: WorkspaceSnapshot): unknown[] {
  return Object.entries(after).flatMap(([table, rows]) => {
    const knownRows = new Set((before[table] ?? []).map((row) => JSON.stringify(row)));
    return rows.filter((row) => !knownRows.has(JSON.stringify(row)));
  });
}

type RowSource = { table: string; workspaceColumn: string; workspaceId: string };

async function readRows(owner: PostgresPool, { table, workspaceColumn, workspaceId }: RowSource): Promise<unknown[]> {
  const { rows } = await owner.query<{ row: unknown }>(
    `SELECT to_jsonb(record) AS row FROM "${table}" record WHERE ${workspaceColumn} = $1 ORDER BY to_jsonb(record)::text`,
    [workspaceId],
  );
  return rows.map(({ row }) => row);
}
