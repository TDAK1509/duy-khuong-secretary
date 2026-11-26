import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { listWorkspaceTables } from './list-workspace-tables.ts';
import { WORKSPACE_B_ID } from './seed-ids.ts';

export type WorkspaceSnapshot = Record<string, unknown[]>;

export async function snapshotWorkspaceB(owner: PostgresPool): Promise<WorkspaceSnapshot> {
  const snapshot: WorkspaceSnapshot = { workspaces: await readRows(owner, 'workspaces', 'id') };
  for (const { name } of await listWorkspaceTables(owner)) {
    snapshot[name] = await readRows(owner, name, 'workspace_id');
  }
  return snapshot;
}

async function readRows(owner: PostgresPool, table: string, workspaceColumn: string): Promise<unknown[]> {
  const { rows } = await owner.query<{ row: unknown }>(
    `SELECT to_jsonb(record) AS row FROM "${table}" record WHERE ${workspaceColumn} = $1 ORDER BY to_jsonb(record)::text`,
    [WORKSPACE_B_ID],
  );
  return rows.map(({ row }) => row);
}
