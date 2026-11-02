import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { DraftProposals } from '../../src/app/admin-chat/draft-proposals.ts';
import { PhotoAttachments } from '../../src/app/admin-chat/photo-attachments.ts';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { insertScheduledTask } from './scheduled-task-rows.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';

describe('the scheduling tools', () => {
  let harness: IntakeHarness;
  let workspaceId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ workspaceId } = harness);
  });

  afterEach(async () => {
    await harness.close();
  });

  function runTool(scope: AccessScope, name: string, args: unknown): Promise<string> {
    const dependencies = { database: harness.pool, clock: harness.clock, attachments: new PhotoAttachments(), drafts: new DraftProposals() };
    return runAdminTool(dependencies, scope, { id: 'call_1', name, argumentsJson: JSON.stringify(args) });
  }

  it('refuses a member who proposes a task', async () => {
    const hung: AccessScope = { workspaceId, userId: harness.hungUserId, role: 'member' };
    const proposal = { title: 'Báo cáo', instruction: 'Lập báo cáo.', repeat: 'daily', run_once_at: null, time_of_day: '18:00', weekday: null, day_of_month: null };

    const output = await runTool(hung, 'propose_scheduled_task', proposal);

    expect(output).toBe('{"ok":false,"error":"Không có quyền."}');
    expect(await harness.database.query('SELECT 1 FROM scheduled_tasks')).toEqual([]);
  });

  it('lists only the active tasks the caller created in this workspace', async () => {
    const duyUserId = await insertMember(harness.database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    const khuongUserId = await insertMember(harness.database, { workspaceId, externalUserId: 'zu-khuong', displayName: 'Khương', role: 'admin' });
    const otherWorkspaceId = await insertWorkspace(harness.database, 'Xe tải Thử');
    const vyUserId = await insertMember(harness.database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy', role: 'admin' });
    const nextRunAt = new Date('2026-11-02T18:00:00+07:00');
    await insertScheduledTask(harness.database, { workspaceId, createdBy: duyUserId, title: 'Của Duy', status: 'active', nextRunAt });
    await insertScheduledTask(harness.database, { workspaceId, createdBy: duyUserId, title: 'Nháp của Duy', status: 'draft' });
    await insertScheduledTask(harness.database, { workspaceId, createdBy: khuongUserId, title: 'Của Khương', status: 'active', nextRunAt });
    await insertScheduledTask(harness.database, { workspaceId: otherWorkspaceId, createdBy: vyUserId, title: 'Của Vy', status: 'active', nextRunAt });

    const output = await runTool({ workspaceId, userId: duyUserId, role: 'admin' }, 'list_scheduled_tasks', {});

    expect(JSON.parse(output)).toEqual({
      tasks: [
        { id: expect.any(String), title: 'Của Duy', instruction: 'Lập báo cáo.', schedule: '18:00 hằng ngày', next_run: '18:00 02/11/2026' },
      ],
    });
  });

  it('cancels a task of the caller and clears its next run', async () => {
    const duyUserId = await insertMember(harness.database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    const nextRunAt = new Date('2026-11-02T18:00:00+07:00');
    const taskId = await insertScheduledTask(harness.database, { workspaceId, createdBy: duyUserId, status: 'active', nextRunAt });

    const output = await runTool({ workspaceId, userId: duyUserId, role: 'admin' }, 'cancel_scheduled_task', { task_id: taskId });

    expect(output).toBe('{"ok":true}');
    expect(await harness.database.query('SELECT status, next_run_at FROM scheduled_tasks')).toEqual([
      { status: 'cancelled', next_run_at: null },
    ]);
  });
});
