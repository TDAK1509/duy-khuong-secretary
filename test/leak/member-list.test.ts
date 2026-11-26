import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { openLeakDatabases } from './support/leak-databases.ts';
import { assertNoLeak } from './support/leak-check.ts';
import { resetDatabase } from './support/reset-database.ts';
import { snapshotWorkspaceB } from './support/snapshot-workspace-b.ts';
import { callChatTool } from './support/call-chat-tool.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test('the member list returns only A members under the runtime role', async () => {
  const snapshotBefore = await snapshotWorkspaceB(databases.owner);
  const result = await callChatTool(databases.runtime, 'list_members', {});
  assertNoLeak([result]);
  assert.deepEqual(readMemberNames(result), ['SAFE-A-ADMIN', 'SAFE-A-DRIVER']);
  assert.deepEqual(await snapshotWorkspaceB(databases.owner), snapshotBefore);
});

function readMemberNames(result: string): string[] {
  const { members } = JSON.parse(result) as { members: { name: string }[] };
  return members.map((member) => member.name);
}
