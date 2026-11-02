import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { CreatedTasks } from '../../src/app/admin-chat/created-tasks.ts';
import { PhotoAttachments } from '../../src/app/admin-chat/photo-attachments.ts';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { insertScheduledTask } from './scheduled-task-rows.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';

const DAILY_REPORT = {
  title: 'Báo cáo hằng ngày',
  instruction: 'Lập báo cáo.',
  repeat: 'daily',
  run_once_at: null,
  time_of_day: '18:00',
  weekday: null,
  day_of_month: null,
  maintenance_rules: [],
};

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

  function runTool(scope: AccessScope, name: string, args: unknown, created = new CreatedTasks(null)): Promise<string> {
    const dependencies = { database: harness.pool, clock: harness.clock, attachments: new PhotoAttachments(), created };
    return runAdminTool(dependencies, scope, { id: 'call_1', name, argumentsJson: JSON.stringify(args) });
  }

  it('refuses a member who creates a task', async () => {
    const hung: AccessScope = { workspaceId, userId: harness.hungUserId, role: 'member' };
    const request = { title: 'Báo cáo', instruction: 'Lập báo cáo.', repeat: 'daily', run_once_at: null, time_of_day: '18:00', weekday: null, day_of_month: null };

    const output = await runTool(hung, 'create_scheduled_task', request);

    expect(output).toBe('{"ok":false,"error":"Không có quyền."}');
    expect(await harness.database.query('SELECT 1 FROM scheduled_tasks')).toEqual([]);
  });

  async function addAdmin(): Promise<AccessScope> {
    const userId = await insertMember(harness.database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    return { workspaceId, userId, role: 'admin' };
  }

  it('stores one task when the same creation runs twice', async () => {
    const duy = await addAdmin();
    harness.clock.setTo(new Date('2026-10-31T10:00:00+07:00'));
    const first = await runTool(duy, 'create_scheduled_task', DAILY_REPORT, new CreatedTasks('message-1'));

    const again = await runTool(duy, 'create_scheduled_task', DAILY_REPORT, new CreatedTasks('message-1'));

    expect(again).toBe(first);
    expect(await harness.database.query('SELECT creation_key FROM scheduled_tasks')).toEqual([{ creation_key: 'message-1:1' }]);
  });

  it('stores two tasks when one turn creates two', async () => {
    const duy = await addAdmin();
    harness.clock.setTo(new Date('2026-10-31T10:00:00+07:00'));
    const created = new CreatedTasks('message-1');

    await runTool(duy, 'create_scheduled_task', DAILY_REPORT, created);
    await runTool(duy, 'create_scheduled_task', { ...DAILY_REPORT, title: 'Báo cáo tuần' }, created);

    expect(await harness.database.query(`SELECT status, creation_key FROM scheduled_tasks ORDER BY creation_key`)).toEqual([
      { status: 'active', creation_key: 'message-1:1' },
      { status: 'active', creation_key: 'message-1:2' },
    ]);
  });

  it('lists only the active tasks the caller created in this workspace', async () => {
    const duyUserId = await insertMember(harness.database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    const khuongUserId = await insertMember(harness.database, { workspaceId, externalUserId: 'zu-khuong', displayName: 'Khương', role: 'admin' });
    const otherWorkspaceId = await insertWorkspace(harness.database, 'Xe tải Thử');
    const vyUserId = await insertMember(harness.database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy', role: 'admin' });
    const nextRunAt = new Date('2026-11-02T18:00:00+07:00');
    await insertScheduledTask(harness.database, { workspaceId, createdBy: duyUserId, title: 'Của Duy', status: 'active', nextRunAt });
    await insertScheduledTask(harness.database, { workspaceId, createdBy: duyUserId, title: 'Nháp cũ của Duy', status: 'draft' });
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

  it('cannot cancel the task of another admin', async () => {
    const duyUserId = await insertMember(harness.database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    const khuongUserId = await insertMember(harness.database, { workspaceId, externalUserId: 'zu-khuong', displayName: 'Khương', role: 'admin' });
    const taskId = await insertScheduledTask(harness.database, { workspaceId, createdBy: khuongUserId, status: 'active' });

    const output = await runTool({ workspaceId, userId: duyUserId, role: 'admin' }, 'cancel_scheduled_task', { task_id: taskId });

    expect(output).toBe('{"ok":false,"error":"Không tìm thấy lịch này."}');
    expect(await harness.database.query('SELECT status FROM scheduled_tasks')).toEqual([{ status: 'active' }]);
  });
});
