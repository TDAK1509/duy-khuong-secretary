import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertMembership, insertWorkspace } from './workspace-rows.ts';

describe('what a removed person can still do', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;
  let hungUserId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId, hungUserId } = harness);
  });

  afterEach(async () => {
    await harness.close();
  });

  async function removeHungFromFirstWorkspace(): Promise<void> {
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    const [hung] = await database.query<{ id: string }>(
      `SELECT id FROM memberships WHERE user_id = '${hungUserId}' AND workspace_id = '${workspaceId}'`,
    );
    const call = { id: 'call_1', name: 'remove_member', argumentsJson: JSON.stringify({ member_id: hung?.id }) };
    await runAdminTool({ database: harness.pool, clock: harness.clock }, { workspaceId, userId: duyUserId, role: 'admin' }, call);
  }

  it('continues in their other workspace', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải V');
    await insertMembership(database, { workspaceId: otherWorkspaceId, userId: hungUserId, displayName: 'Hùng' });
    await removeHungFromFirstWorkspace();

    await harness.receiveText('zu-hung', 'Đổ dầu 500.000đ');

    expect(await database.query(`SELECT workspace_id FROM messages WHERE author = 'user'`)).toEqual([
      { workspace_id: otherWorkspaceId },
    ]);
  });
});
