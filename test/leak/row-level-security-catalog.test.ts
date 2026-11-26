import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { openLeakDatabases } from './support/leak-databases.ts';
import { listWorkspaceTables } from './support/list-workspace-tables.ts';

const TABLES_WITHOUT_ROW_LEVEL_SECURITY = ['memberships', 'workspace_invites', 'scheduled_tasks', 'llm_calls', 'credit_additions'];

const databases = openLeakDatabases();

after(() => databases.close());

test('every table with a workspace_id column has row-level security, except five known tables', async () => {
  const tables = await listWorkspaceTables(databases.owner);
  const unprotected = tables.filter((table) => !table.hasRowLevelSecurity).map((table) => table.name);
  const unexpected = unprotected.filter((name) => !TABLES_WITHOUT_ROW_LEVEL_SECURITY.includes(name));
  assert.deepEqual(unexpected, []);
});
