import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import type { PostgresPool } from '../../src/providers/database/postgres.ts';
import { sendAdminQuestion } from './support/admin-chat-session.ts';
import { ATTACK_CASES } from './support/attack-cases.ts';
import { ATTACK_TEXT } from './support/attack-text.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { assertNoLeak } from './support/leak-check.ts';
import { markAdminAsJoinedBeforeHistory } from './support/prepare-chat-seed.ts';
import { resetDatabase } from './support/reset-database.ts';
import { ScriptedChatModel } from './support/scripted-chat-model.ts';
import { snapshotWorkspaceB } from './support/snapshot-workspace-b.ts';

const databases = openLeakDatabases();

beforeEach(async () => {
  await resetDatabase(databases.owner);
  await markAdminAsJoinedBeforeHistory(databases.owner);
});

after(() => databases.close());

test('an obedient model in admin chat sends the A admin no B data under the runtime role', () => assertObedientModelLeaksNothing(databases.runtime));

test('an obedient model in admin chat sends the A admin no B data under the owner role', () => assertObedientModelLeaksNothing(databases.owner));

async function assertObedientModelLeaksNothing(database: PostgresPool): Promise<void> {
  const snapshotBefore = await snapshotWorkspaceB(databases.owner);
  const model = new ScriptedChatModel(ATTACK_CASES);
  const turn = await sendAdminQuestion({ owner: databases.owner, database, model, text: ATTACK_TEXT });
  assertNoLeak(turn.observations, { passedIds: turn.passedIds, label: 'the admin chat turn' });
  assert.deepEqual(await snapshotWorkspaceB(databases.owner), snapshotBefore, 'the admin chat turn changed a workspace B row');
}
