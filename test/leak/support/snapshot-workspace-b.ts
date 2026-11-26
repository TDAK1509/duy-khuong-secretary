import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { WORKSPACE_B_ID } from './seed-ids.ts';
import { snapshotWorkspace, type WorkspaceSnapshot } from './snapshot-workspace.ts';

export function snapshotWorkspaceB(owner: PostgresPool): Promise<WorkspaceSnapshot> {
  return snapshotWorkspace(owner, WORKSPACE_B_ID);
}
