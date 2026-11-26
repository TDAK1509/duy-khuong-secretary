import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import type { PostgresPool } from '../../src/providers/database/postgres.ts';
import { sendAdminReply } from './support/admin-chat-session.ts';
import { assertConfirmedCallsRan } from './support/assert-confirmed-calls-ran.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { assertNoLeak, collectPassedIds } from './support/leak-check.ts';
import { storeGuardedChangesAimedAtB } from './support/prepare-chat-seed.ts';
import { resetDatabase } from './support/reset-database.ts';
import { ScriptedChatModel } from './support/scripted-chat-model.ts';
import { snapshotWorkspaceB } from './support/snapshot-workspace-b.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test('stored changes aimed at B change no B row after the admin says có, under the runtime role', () => assertConfirmedChangesLeaveWorkspaceBUnchanged(databases.runtime));

test('stored changes aimed at B change no B row after the admin says có, under the owner role', () => assertConfirmedChangesLeaveWorkspaceBUnchanged(databases.owner));

async function assertConfirmedChangesLeaveWorkspaceBUnchanged(database: PostgresPool): Promise<void> {
  const storedCalls = await storeGuardedChangesAimedAtB(databases.owner);
  const snapshotBefore = await snapshotWorkspaceB(databases.owner);
  const model = new ScriptedChatModel([]);
  const passedIds = storedCalls.flatMap((call) => collectPassedIds(call.arguments));
  const turn = await sendAdminReply({ owner: databases.owner, database, model, text: 'có', passedIds });
  assertConfirmedCallsRan(model, storedCalls);
  assertNoLeak(turn.observations, { passedIds: turn.passedIds, label: 'the confirmed changes' });
  assert.deepEqual(await snapshotWorkspaceB(databases.owner), snapshotBefore, 'the confirmed changes changed a workspace B row');
}
