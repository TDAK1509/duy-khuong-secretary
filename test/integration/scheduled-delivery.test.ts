import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIntakeHarness, NOW, type IntakeHarness } from './intake-harness.ts';
import { insertOutboundMessage, type NewOutboundMessage } from './outbound-message-rows.ts';
import { insertScheduledTask } from './scheduled-task-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const DAY_MS = 24 * 60 * 60_000;

describe('the delivery rule for scheduled results', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;
  let duyUserId: string;
  let taskId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId } = harness);
    duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    taskId = await insertScheduledTask(database, { workspaceId, createdBy: duyUserId, status: 'active' });
  });

  afterEach(async () => {
    await harness.close();
  });

  function wroteDaysAgo(days: number): Promise<unknown> {
    const lastInboundAt = new Date(NOW.getTime() - days * DAY_MS).toISOString();
    return database.query(`UPDATE channel_identities SET last_inbound_at = '${lastInboundAt}' WHERE external_user_id = 'zu-duy'`);
  }

  function insertScheduledResult(message: NewOutboundMessage = {}): Promise<string> {
    return insertOutboundMessage(database, { externalUserId: 'zu-duy', scheduledTaskId: taskId, ...message });
  }

  function readStatuses(): Promise<{ status: string }[]> {
    return database.query('SELECT status FROM outbound_messages ORDER BY seq');
  }

  it('sends a result normally to an admin who wrote 2 days ago', async () => {
    await wroteDaysAgo(2);
    await insertScheduledResult();

    await harness.sendQueuedTexts();

    expect(await readStatuses()).toEqual([{ status: 'sent' }]);
  });

  it('holds a result for an admin quiet for 8 days and sends no template without a template id', async () => {
    await wroteDaysAgo(8);
    await insertScheduledResult();

    await harness.sendQueuedTexts();

    expect(await readStatuses()).toEqual([{ status: 'held' }]);
    expect(harness.channel.sends).toEqual([]);
    expect(await database.query("SELECT 1 FROM outbound_messages WHERE kind = 'template'")).toEqual([]);
  });

  it('triggers one template for a held result when a template is configured', async () => {
    harness.setReportReadyTemplate('tpl-1');
    taskId = await insertScheduledTask(database, { workspaceId, createdBy: duyUserId, status: 'active', title: 'Báo cáo hằng ngày' });
    await wroteDaysAgo(8);
    await insertScheduledResult();

    await harness.sendQueuedTexts();

    expect(await database.query('SELECT external_user_id, template_id, template_params FROM outbound_messages WHERE kind = \'template\'')).toEqual([
      { external_user_id: 'zu-duy', template_id: 'tpl-1', template_params: { task_title: 'Báo cáo hằng ngày' } },
    ]);
  });
});
