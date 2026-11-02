import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replyWithText } from '../fakes/fake-chat-service.ts';
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

  async function findMembershipId(): Promise<string> {
    const [membership] = await database.query<{ id: string }>(`SELECT id FROM memberships WHERE user_id = '${duyUserId}'`);
    if (!membership) throw new Error('the admin has no membership');
    return membership.id;
  }

  function listSessionsWaitingFor(blockerPid: number): Promise<unknown[]> {
    return database.query(`SELECT DISTINCT pid FROM pg_locks WHERE NOT granted AND ${blockerPid} = ANY(pg_blocking_pids(pid))`);
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
    await insertScheduledResult({ adminMembershipId: await findMembershipId() });

    await harness.sendQueuedTexts();

    expect(
      await database.query("SELECT external_user_id, template_id, template_params, admin_membership_id FROM outbound_messages WHERE kind = 'template'"),
    ).toEqual([
      {
        external_user_id: 'zu-duy',
        template_id: 'tpl-1',
        template_params: { task_title: 'Báo cáo hằng ngày' },
        admin_membership_id: await findMembershipId(),
      },
    ]);
  });

  it('cuts a long task title to 30 characters in the template', async () => {
    harness.setReportReadyTemplate('tpl-1');
    const longTitle = 'Báo cáo hằng ngày về doanh thu của các xe';
    expect(longTitle).toHaveLength(41);
    taskId = await insertScheduledTask(database, { workspaceId, createdBy: duyUserId, status: 'active', title: longTitle });
    await wroteDaysAgo(8);
    await insertScheduledResult();

    await harness.sendQueuedTexts();

    expect(await database.query("SELECT template_params FROM outbound_messages WHERE kind = 'template'")).toEqual([
      { template_params: { task_title: 'Báo cáo hằng ngày về doanh thu…' } },
    ]);
  });

  it('sends no second template for another held result in the same quiet period', async () => {
    harness.setReportReadyTemplate('tpl-1');
    await wroteDaysAgo(8);
    await insertOutboundMessage(database, { externalUserId: 'zu-duy', templateId: 'tpl-1', status: 'sent' });
    await insertScheduledResult();

    await harness.sendQueuedTexts();

    expect(await readStatuses()).toEqual([{ status: 'sent' }, { status: 'held' }]);
  });

  it('sends a template although the admin is quiet', async () => {
    await wroteDaysAgo(8);
    await insertOutboundMessage(database, { externalUserId: 'zu-duy', templateId: 'tpl-1' });

    await harness.sendQueuedTexts();

    expect(harness.channel.templates).toEqual([
      { to: { channel: 'zalo-oa', accountId: 'oa-1', externalUserId: 'zu-duy' }, templateId: 'tpl-1', params: {}, credential: 'a1' },
    ]);
  });

  it("holds a scheduled result when Zalo answers that the window is closed", async () => {
    await wroteDaysAgo(2);
    await insertScheduledResult();
    harness.channel.nextTextResult = { ok: false, reason: 'window_closed' };

    await harness.sendQueuedTexts();

    expect(await readStatuses()).toEqual([{ status: 'held' }]);
  });

  it('keeps a rejected template failed and its result held', async () => {
    await wroteDaysAgo(8);
    await insertScheduledResult({ status: 'held' });
    await insertOutboundMessage(database, { externalUserId: 'zu-duy', templateId: 'tpl-1' });
    harness.channel.nextTemplateResult = { ok: false, reason: 'rejected' };

    await harness.sendQueuedTexts();

    expect(await readStatuses()).toEqual([{ status: 'held' }, { status: 'failed' }]);
  });

  it('sends a result instead of holding it when the admin wrote while the hold was deciding', async () => {
    await wroteDaysAgo(8);
    await insertScheduledResult();
    const writer = await database.openSession();
    await writer.query('BEGIN');
    await writer.query("SELECT 1 FROM channel_identities WHERE external_user_id = 'zu-duy' FOR UPDATE");

    const { rows: [writerSession] } = await writer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    const step = harness.sendQueuedTexts();
    try {
      await vi.waitFor(async () => expect(await listSessionsWaitingFor(writerSession?.pid ?? 0)).toHaveLength(1), { timeout: 3000 });
      await writer.query(`UPDATE channel_identities SET last_inbound_at = '${NOW.toISOString()}' WHERE external_user_id = 'zu-duy'`);
    } finally {
      await writer.query('COMMIT');
    }
    await step;
    await harness.sendQueuedTexts();

    expect(await readStatuses()).toEqual([{ status: 'sent' }]);
  });

  it('sends a result when the admin wrote while the chat still answers', async () => {
    await wroteDaysAgo(8);
    await insertScheduledResult();
    let openAnswerGate = (): void => {};
    const answerGate = new Promise<void>((resolve) => (openAnswerGate = resolve));
    harness.chat.follow(async () => {
      await answerGate;
      return replyWithText('Chào anh');
    });

    const inbound = harness.receiveText('zu-duy', 'chào');
    try {
      await vi.waitFor(() => expect(harness.chat.requests).toHaveLength(1), { timeout: 5000 });
      await harness.sendQueuedTexts();
      expect(await readStatuses()).toEqual([{ status: 'sent' }]);
    } finally {
      openAnswerGate();
      await inbound;
    }
  });

  describe('when the admin writes again', () => {
    beforeEach(async () => {
      await wroteDaysAgo(8);
      await insertScheduledResult({ status: 'held', body: 'Báo cáo 1' });
      await insertScheduledResult({ status: 'held', body: 'Báo cáo 2' });
    });

    it('sends the held line first', async () => {
      await harness.receiveText('zu-duy', 'chào');
      await harness.sendQueuedTexts();

      expect(harness.channel.texts[0]?.text).toBe(
        'Bạn có 2 tin nhắn từ lịch tự động chưa nhận được. Trợ lý gửi ngay sau đây.',
      );
    });

    it('delivers the held results in their order and leaves none held', async () => {
      await harness.receiveText('zu-duy', 'chào');
      await harness.sendAllQueuedTexts();

      expect(harness.channel.texts.slice(0, 3).map((sent) => sent.text)).toEqual([
        'Bạn có 2 tin nhắn từ lịch tự động chưa nhận được. Trợ lý gửi ngay sau đây.',
        'Báo cáo 1',
        'Báo cáo 2',
      ]);
      expect(await database.query("SELECT 1 FROM outbound_messages WHERE status = 'held'")).toEqual([]);
    });
  });
});
