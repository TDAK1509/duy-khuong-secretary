import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OperatorAlerts } from '../../src/app/alerts/operator-alerts.ts';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
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
import { insertInvite, insertWorkspace } from './workspace-rows.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ENCRYPTION_KEY = 'a'.repeat(64);
const CODE = 'MOI-7K4P9X';

describe('joining a workspace with an invite code', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let channel: FakeMessagingChannel;
  let alerts: OperatorAlerts;
  let workspaceId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    channel = new FakeMessagingChannel();
    alerts = new OperatorAlerts(new FakeAlertSink(), clock);
    const tokens = makeTokenPair({ accessToken: 'a1' });
    await storeConnection(pool, { channel: 'zalo-oa', accountId: 'oa-1', tokens, storedAt: NOW }, ENCRYPTION_KEY);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('makes the sender a member with the name and role of the code', async () => {
    await insertInvite(database, { workspaceId, code: CODE, displayName: 'Hùng', role: 'member' });

    await receiveText('zu-hung', CODE);

    const memberships = await database.query('SELECT workspace_id, display_name, role FROM memberships');
    expect(memberships).toEqual([{ workspace_id: workspaceId, display_name: 'Hùng', role: 'member' }]);
  });

  it('links the Zalo account to a new user who owns the membership', async () => {
    await insertInvite(database, { workspaceId, code: CODE, displayName: 'Hùng', role: 'member' });

    await receiveText('zu-hung', CODE);

    const [membership] = await database.query<{ user_id: string }>('SELECT user_id FROM memberships');
    const identities = await database.query('SELECT external_user_id, user_id FROM channel_identities');
    expect(identities).toEqual([{ external_user_id: 'zu-hung', user_id: membership?.user_id }]);
  });

  it('uses up the invite', async () => {
    await insertInvite(database, { workspaceId, code: CODE, displayName: 'Hùng', role: 'member' });

    await receiveText('zu-hung', CODE);

    const [membership] = await database.query<{ user_id: string }>('SELECT user_id FROM memberships');
    const invites = await database.query('SELECT used_at, used_by FROM workspace_invites');
    expect(invites).toEqual([{ used_at: NOW, used_by: membership?.user_id }]);
  });

  async function receiveText(externalUserId: string, text: string): Promise<void> {
    await insertInboundEvent(database, { externalUserId, text });
    await runInboundStep({
      database: pool,
      clock,
      alerts,
      notices: new OffGroupNotices(clock, () => {}),
      handler: createInboundHandler({ channel, clock, database: pool, encryptionKey: ENCRYPTION_KEY }),
    });
  }
});
