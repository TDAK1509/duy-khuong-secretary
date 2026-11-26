import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import type { PostgresPool } from '../../src/providers/database/postgres.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { assertNoLeak } from './support/leak-check.ts';
import { resetDatabase } from './support/reset-database.ts';
import { SHARED_PLATE } from './support/seed-ids.ts';
import { snapshotWorkspaceB } from './support/snapshot-workspace-b.ts';
import { callChatTool } from './support/call-chat-tool.ts';

const SEARCH_WITH_B_NAMES = {
  text: 'TARGET-B-WORKSPACE',
  category: null,
  member: null,
  plate: SHARED_PLATE,
  added_from: null,
  added_to: null,
  cursor: null,
};

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test('record search with B names returns only A records under the runtime role', () => assertSearchKeepsWorkspaceBOut(databases.runtime));

test('record search with B names returns only A records under the owner role', () => assertSearchKeepsWorkspaceBOut(databases.owner));

async function assertSearchKeepsWorkspaceBOut(database: PostgresPool): Promise<void> {
  const snapshotBefore = await snapshotWorkspaceB(databases.owner);
  const result = await callChatTool(database, 'search_records', SEARCH_WITH_B_NAMES);
  assert.match(result, /SAFE-A-RECORD/);
  assertNoLeak([result]);
  assert.deepEqual(await snapshotWorkspaceB(databases.owner), snapshotBefore);
}
