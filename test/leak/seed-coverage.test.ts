import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import type { PostgresPool } from '../../src/providers/database/postgres.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { listWorkspaceTables, type WorkspaceTable } from './support/list-workspace-tables.ts';
import { resetDatabase } from './support/reset-database.ts';
import { WORKSPACE_A_ID, WORKSPACE_B_ID } from './support/seed-ids.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test('the seed holds an A row and a B row in every table with a workspace_id column', async () => {
  const tables = await listWorkspaceTables(databases.owner);
  assert.deepEqual(await listMissingSeedRows(databases.owner, tables), []);
});

async function listMissingSeedRows(owner: PostgresPool, tables: WorkspaceTable[]): Promise<string[]> {
  const missing: string[] = [];
  for (const { name } of tables) {
    if ((await countRows(owner, name, WORKSPACE_A_ID)) === 0) missing.push(`${name} has no A row`);
    if ((await countRows(owner, name, WORKSPACE_B_ID)) === 0) missing.push(`${name} has no B row`);
  }
  return missing;
}

async function countRows(owner: PostgresPool, table: string, workspaceId: string): Promise<number> {
  const { rows } = await owner.query<{ count: number }>(`SELECT count(*)::int AS count FROM "${table}" WHERE workspace_id = $1`, [workspaceId]);
  return rows[0]?.count ?? 0;
}
