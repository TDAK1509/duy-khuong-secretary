import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorAlerts } from '../../src/app/alerts/operator-alerts.ts';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { runOutboundStep } from '../../src/app/delivery/outbound-step.ts';
import { createInboundHandler } from '../../src/app/processing/handle-inbound-event.ts';
import { runInboundStep } from '../../src/app/processing/inbound-step.ts';
import { OffGroupNotices } from '../../src/app/processing/off-group-notices.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeAlertSink } from '../fakes/fake-alert-sink.ts';
import { makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { FakeMessagingChannel } from '../fakes/fake-messaging-channel.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertMembership, insertWorkspace } from './workspace-rows.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ENCRYPTION_KEY = 'a'.repeat(64);

describe('switching between workspaces', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let channel: FakeMessagingChannel;
  let alerts: OperatorAlerts;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    channel = new FakeMessagingChannel();
    alerts = new OperatorAlerts(new FakeAlertSink(), clock);
    const tokens = makeTokenPair({ accessToken: 'a1' });
    await storeConnection(pool, { channel: 'zalo-oa', accountId: 'oa-1', tokens, storedAt: NOW }, ENCRYPTION_KEY);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    otherWorkspaceId = await insertWorkspace(database, 'Xe tải Thử');
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('lists the workspaces of the person by name', async () => {
    await insertDuyInBothWorkspaces(otherWorkspaceId);

    await receiveText('zu-duy', 'đổi nhóm');
    await sendQueuedTexts();

    expect(channel.texts.map((sent) => [sent.to.externalUserId, sent.text])).toEqual([
      [
        'zu-duy',
        'Bạn đang ở nhóm "Xe tải Thử". Chọn nhóm bằng cách trả lời số:\n1. Xe tải Duy Khương\n2. Xe tải Thử',
      ],
    ]);
  });

  it('stores the sent list as the pending choice in its order', async () => {
    await insertDuyInBothWorkspaces(workspaceId);

    await receiveText('zu-duy', 'đổi nhóm');
    await sendQueuedTexts();

    expect(await database.query('SELECT pending_choice FROM channel_identities')).toEqual([
      { pending_choice: { kind: 'workspace_pick', workspace_ids: [workspaceId, otherWorkspaceId] } },
    ]);
  });

  it('stores no choice for a list that was not sent before the next message', async () => {
    await insertDuyInBothWorkspaces(workspaceId);
    await receiveText('zu-duy', 'đổi nhóm');

    await receiveText('zu-duy', '2');
    await sendQueuedTexts();
    await sendQueuedTexts();

    expect(await database.query('SELECT current_workspace_id, pending_choice FROM channel_identities')).toEqual([
      { current_workspace_id: workspaceId, pending_choice: null },
    ]);
  });

  it('switches to the workspace the person answered with', async () => {
    await insertDuyInBothWorkspaces(workspaceId);
    await storeWorkspacePick([workspaceId, otherWorkspaceId]);

    await receiveText('zu-duy', '2');

    expect(await database.query('SELECT current_workspace_id FROM channel_identities')).toEqual([
      { current_workspace_id: otherWorkspaceId },
    ]);
  });

  it('confirms the new workspace', async () => {
    await insertDuyInBothWorkspaces(workspaceId);
    await storeWorkspacePick([workspaceId, otherWorkspaceId]);

    await receiveText('zu-duy', '2');
    await sendQueuedTexts();

    expect(channel.texts.map((sent) => sent.text)).toEqual([
      'Đã chuyển sang nhóm "Xe tải Thử". Tin nhắn tiếp theo sẽ lưu vào nhóm này.',
    ]);
  });

  it('clears the choice once the person answered it', async () => {
    await insertDuyInBothWorkspaces(workspaceId);
    await storeWorkspacePick([workspaceId, otherWorkspaceId]);

    await receiveText('zu-duy', '2');

    expect(await database.query('SELECT pending_choice FROM channel_identities')).toEqual([{ pending_choice: null }]);
  });

  it('understands the switch command without accents and in capitals', async () => {
    await insertDuyInBothWorkspaces(workspaceId);

    await receiveText('zu-duy', 'DOI NHOM');
    await sendQueuedTexts();

    expect(await database.query('SELECT pending_choice FROM channel_identities')).toEqual([
      { pending_choice: { kind: 'workspace_pick', workspace_ids: [workspaceId, otherWorkspaceId] } },
    ]);
  });

  it('tells a person in one workspace that there is nothing to switch', async () => {
    await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });

    await receiveText('zu-hung', 'đổi nhóm');
    await sendQueuedTexts();

    expect(channel.texts.map((sent) => sent.text)).toEqual(['Bạn chỉ ở một nhóm: "Xe tải Duy Khương".']);
    expect(await database.query('SELECT pending_choice FROM channel_identities')).toEqual([{ pending_choice: null }]);
  });

  it('refuses a number outside the list', async () => {
    await insertDuyInBothWorkspaces(workspaceId);
    await storeWorkspacePick([workspaceId, otherWorkspaceId]);

    await receiveText('zu-duy', '5');
    await sendQueuedTexts();

    expect(channel.texts.map((sent) => sent.text)).toEqual(['Số không hợp lệ. Bạn nhắn "đổi nhóm" để xem lại danh sách.']);
    expect(await database.query('SELECT current_workspace_id FROM channel_identities')).toEqual([
      { current_workspace_id: workspaceId },
    ]);
  });

  it('tells a bare number with nothing stored that no choice is waiting', async () => {
    await insertDuyInBothWorkspaces(workspaceId);

    await receiveText('zu-duy', '1');
    await sendQueuedTexts();

    expect(channel.texts.map((sent) => sent.text)).toEqual(['Không có lựa chọn nào đang chờ. Bạn nhắn lại yêu cầu nhé.']);
  });

  it('clears the stored choice when the person writes something else', async () => {
    await insertDuyInBothWorkspaces(workspaceId);
    await storeWorkspacePick([workspaceId, otherWorkspaceId]);

    await receiveText('zu-duy', 'chào');

    expect(await database.query('SELECT pending_choice FROM channel_identities')).toEqual([{ pending_choice: null }]);
  });

  it('refuses a workspace the person left since the list was shown', async () => {
    await insertDuyInBothWorkspaces(workspaceId);
    await storeWorkspacePick([workspaceId, otherWorkspaceId]);
    await database.query(`DELETE FROM memberships WHERE workspace_id = '${otherWorkspaceId}'`);

    await receiveText('zu-duy', '2');
    await sendQueuedTexts();

    expect(channel.texts.map((sent) => sent.text)).toEqual(['Số không hợp lệ. Bạn nhắn "đổi nhóm" để xem lại danh sách.']);
    expect(await database.query('SELECT current_workspace_id FROM channel_identities')).toEqual([
      { current_workspace_id: workspaceId },
    ]);
  });

  it('stores no choice when a message arrives while the list is being marked sent', async () => {
    await insertDuyInBothWorkspaces(workspaceId);
    await receiveText('zu-duy', 'đổi nhóm');
    const session = await database.openSession();
    await session.query('BEGIN');
    await session.query(`SELECT 1 FROM channel_identities WHERE external_user_id = 'zu-duy' FOR UPDATE`);

    const sending = sendQueuedTexts();
    await waitUntilSomeStatementWaitsForALock();
    await insertInboundEvent(database, { externalUserId: 'zu-duy', text: 'chào' });
    await session.query('COMMIT');
    await sending;

    expect(await database.query('SELECT pending_choice FROM channel_identities')).toEqual([{ pending_choice: null }]);
  });

  async function waitUntilSomeStatementWaitsForALock(): Promise<void> {
    await vi.waitFor(async () => {
      const waiting = await database.query(
        `SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );
      expect(waiting).toHaveLength(1);
    });
  }

  async function storeWorkspacePick(workspaceIds: string[]): Promise<void> {
    const choice = JSON.stringify({ kind: 'workspace_pick', workspace_ids: workspaceIds });
    await database.query(`UPDATE channel_identities SET pending_choice = '${choice}'::jsonb`);
  }

  async function insertDuyInBothWorkspaces(currentWorkspaceId: string): Promise<void> {
    const userId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await insertMembership(database, { workspaceId: otherWorkspaceId, userId, displayName: 'Duy', role: 'admin' });
    await database.query(`UPDATE channel_identities SET current_workspace_id = '${currentWorkspaceId}'`);
  }

  async function receiveText(externalUserId: string, text: string): Promise<void> {
    await insertInboundEvent(database, { externalUserId, text });
    await runInbound();
  }

  async function runInbound(): Promise<unknown> {
    return runInboundStep({
      database: pool,
      clock,
      alerts,
      notices: new OffGroupNotices(clock, () => {}),
      handler: createInboundHandler({ channel, clock, database: pool, encryptionKey: ENCRYPTION_KEY }),
    });
  }

  async function sendQueuedTexts(): Promise<void> {
    await runOutboundStep({ database: pool, clock, alerts, channel, encryptionKey: ENCRYPTION_KEY, maxPerMinute: 90 });
  }
});
