import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import type { PostgresPool } from '../../src/providers/database/postgres.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { assertNoLeak } from './support/leak-check.ts';
import { storeAttackAsDueTaskInstruction } from './support/prepare-chat-seed.ts';
import { resetDatabase } from './support/reset-database.ts';
import { runScheduledAttack } from './support/run-scheduled-attack.ts';
import { SCHEDULED_ATTACK_CASES } from './support/scheduled-attack-cases.ts';
import { ScriptedChatModel } from './support/scripted-chat-model.ts';
import { snapshotWorkspaceB } from './support/snapshot-workspace-b.ts';

const databases = openLeakDatabases();

beforeEach(async () => {
  await resetDatabase(databases.owner);
  await storeAttackAsDueTaskInstruction(databases.owner);
});

after(() => databases.close());

test('a scheduled run of an injected A task leaks nothing under the runtime role', () => assertInjectedRunLeaksNothing(databases.runtime));

test('a scheduled run of an injected A task leaks nothing under the owner role', () => assertInjectedRunLeaksNothing(databases.owner));

async function assertInjectedRunLeaksNothing(database: PostgresPool): Promise<void> {
  const snapshotBefore = await snapshotWorkspaceB(databases.owner);
  const model = new ScriptedChatModel(SCHEDULED_ATTACK_CASES);
  const run = await runScheduledAttack({ owner: databases.owner, database, model });
  assertNoLeak(run.observations, { passedIds: run.passedIds, label: 'the scheduled run' });
  assert.deepEqual(await snapshotWorkspaceB(databases.owner), snapshotBefore, 'the scheduled run changed a workspace B row');
}
