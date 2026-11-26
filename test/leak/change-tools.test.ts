import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { PostgresPool } from '../../src/providers/database/postgres.ts';
import { CHANGE_ATTACK_CASES } from './support/change-attack-cases.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { assertNoLeak } from './support/leak-check.ts';
import { resetDatabase } from './support/reset-database.ts';
import { runAttackCase } from './support/run-attack-case.ts';
import { snapshotWorkspaceB } from './support/snapshot-workspace-b.ts';
import type { ToolPath } from './support/tool-harness.ts';

const databases = openLeakDatabases();

after(() => databases.close());

test('change tools aimed at B ids change no B row under the runtime role', () => assertChangeToolsLeaveWorkspaceBUnchanged(databases.runtime, 'chat-gate'));

test('change tools aimed at B ids change no B row under the owner role', () => assertChangeToolsLeaveWorkspaceBUnchanged(databases.owner, 'chat-gate'));

async function assertChangeToolsLeaveWorkspaceBUnchanged(database: PostgresPool, path: ToolPath): Promise<void> {
  for (const attackCase of CHANGE_ATTACK_CASES) {
    await resetDatabase(databases.owner);
    const snapshotBefore = await snapshotWorkspaceB(databases.owner);
    const outcome = await runAttackCase({ owner: databases.owner, database, attackCase, path });
    assertNoLeak(outcome.observations, { passedIds: outcome.passedIds, label: attackCase.name });
    assert.deepEqual(await snapshotWorkspaceB(databases.owner), snapshotBefore, `${attackCase.name} changed a workspace B row`);
  }
}
