import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OperatorAlerts } from '../../src/app/alerts/operator-alerts.ts';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { claimOutboundMessage } from '../../src/app/delivery/claim-outbound-message.ts';
import { runOutboundStep } from '../../src/app/delivery/outbound-step.ts';
import { recordSendResult } from '../../src/app/delivery/record-send-result.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { FakeAlertSink } from '../fakes/fake-alert-sink.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { FakeMessagingChannel } from '../fakes/fake-messaging-channel.ts';
import { FakePhotoStorage } from '../fakes/fake-photo-storage.ts';
import { OffGroupNotices } from '../../src/app/processing/off-group-notices.ts';
import type { PhotoStorage } from '../../src/services/storage/photo-storage.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertOutboundMessage, type OutboundRow } from './outbound-message-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ENCRYPTION_KEY = 'a'.repeat(64);

describe('the outbound worker step', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let alertSink: FakeAlertSink;
  let channel: FakeMessagingChannel;
  let photoStorage: FakePhotoStorage;
  let logLines: string[];
  let notices: OffGroupNotices;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    alertSink = new FakeAlertSink();
    channel = new FakeMessagingChannel();
    photoStorage = new FakePhotoStorage();
    logLines = [];
    notices = new OffGroupNotices(clock, (line) => logLines.push(line));
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('sends a queued text to its recipient with the stored access key', async () => {
    await connectOa('oa-1', 'a1');
    await insertOutboundMessage(database, { externalUserId: 'zu-hung', accountId: 'oa-1', body: 'chào' });

    await runStep();

    expect(channel.texts).toEqual([
      {
        to: { channel: 'zalo-oa', accountId: 'oa-1', externalUserId: 'zu-hung' },
        text: 'chào',
        credential: 'a1',
      },
    ]);
  });

  it('marks a delivered text sent at the clock time', async () => {
    await connectOa('oa-1', 'a1');
    const id = await insertOutboundMessage(database, {});

    await runStep();

    expect(await readMessage(id)).toMatchObject({ status: 'sent', sent_at: NOW });
  });

  it("sends a person's texts in queue order", async () => {
    await connectOa('oa-1', 'a1');
    await insertOutboundMessage(database, { body: 'phần 1' });
    await insertOutboundMessage(database, { body: 'phần 2' });

    await runStep();
    await runStep();

    expect(channel.texts.map((sent) => sent.text)).toEqual(['phần 1', 'phần 2']);
  });

  it("holds a person's later text while an earlier one waits for a retry", async () => {
    await connectOa('oa-1', 'a1');
    await insertOutboundMessage(database, { availableAt: new Date(NOW.getTime() + 30_000), body: 'phần 1' });
    await insertOutboundMessage(database, { body: 'phần 2' });

    await runStep();

    expect(channel.texts).toEqual([]);
  });

  it("does not hold up another person's text", async () => {
    await connectOa('oa-1', 'a1');
    await insertOutboundMessage(database, { externalUserId: 'zu-hung', availableAt: new Date(NOW.getTime() + 30_000) });
    await insertOutboundMessage(database, { externalUserId: 'zu-lan' });

    await runStep();

    expect(channel.texts.map((sent) => sent.to.externalUserId)).toEqual(['zu-lan']);
  });

  it('sends nothing once the per-minute limit is reached', async () => {
    await connectOa('oa-1', 'a1');
    const tenSecondsAgo = new Date(NOW.getTime() - 10_000);
    await insertOutboundMessage(database, { status: 'sent', sentAt: tenSecondsAgo });
    await insertOutboundMessage(database, { status: 'sent', sentAt: tenSecondsAgo });
    await insertOutboundMessage(database, { body: 'chờ' });

    await runStep(2);

    expect(channel.texts).toEqual([]);
  });

  it('puts a rate-limited text back in the queue for one minute', async () => {
    await connectOa('oa-1', 'a1');
    const id = await insertOutboundMessage(database, {});
    channel.nextTextResult = { ok: false, reason: 'rate_limited' };

    await runStep();

    expect(await readMessage(id)).toMatchObject({
      status: 'queued',
      available_at: new Date(NOW.getTime() + 60_000),
      last_error: 'rate_limited',
    });
  });

  it('retries a text that never reached Zalo after 30 seconds', async () => {
    await connectOa('oa-1', 'a1');
    const id = await insertOutboundMessage(database, { attempts: 0 });
    channel.nextTextResult = { ok: false, reason: 'unavailable' };

    await runStep();

    expect(await readMessage(id)).toMatchObject({
      status: 'queued',
      available_at: new Date(NOW.getTime() + 30_000),
      last_error: 'unavailable',
    });
  });

  it('fails a text and alerts after the fifth unreachable attempt', async () => {
    await connectOa('oa-1', 'a1');
    const id = await insertOutboundMessage(database, { attempts: 4 });
    channel.nextTextResult = { ok: false, reason: 'unavailable' };

    await runStep();

    expect((await readMessage(id)).status).toBe('failed');
    expect(alertSink.texts).toEqual([`[alert] Outbound message ${id} failed after 5 attempts.`]);
  });

  it('marks a send with no answer unknown and alerts', async () => {
    await connectOa('oa-1', 'a1');
    const id = await insertOutboundMessage(database, {});
    channel.nextTextResult = { ok: false, reason: 'no_answer' };

    await runStep();

    expect((await readMessage(id)).status).toBe('unknown');
    expect(alertSink.texts).toEqual([
      `[alert] Zalo send got no answer for outbound message ${id}. It will not be resent. Check the chat in OA Manager.`,
    ]);
  });

  it('never sends an unknown text again', async () => {
    await connectOa('oa-1', 'a1');
    await insertOutboundMessage(database, { status: 'unknown' });

    await runStep();

    expect(channel.texts).toEqual([]);
  });

  it('fails a rejected text without an alert', async () => {
    await connectOa('oa-1', 'a1');
    const id = await insertOutboundMessage(database, {});
    channel.nextTextResult = { ok: false, reason: 'rejected' };

    await runStep();

    expect(await readMessage(id)).toMatchObject({ status: 'failed', last_error: 'rejected' });
    expect(alertSink.texts).toEqual([]);
  });

  it('marks a send cut off by a crash unknown and alerts', async () => {
    const id = await insertOutboundMessage(database, { status: 'sending', lockedUntil: new Date(NOW.getTime() - 60_000) });

    await runStep();

    expect((await readMessage(id)).status).toBe('unknown');
    expect(alertSink.texts).toEqual([
      `[alert] Zalo send got no answer for outbound message ${id}. It will not be resent. Check the chat in OA Manager.`,
    ]);
  });

  it('ignores a late result for a text that became unknown', async () => {
    const id = await insertOutboundMessage(database, {});
    const claimed = await claimOutboundMessage(pool, NOW, 90);
    clock.advanceBy(3 * 60_000);
    await runStep();

    await recordSendResult({ database: pool, clock, alerts: new OperatorAlerts(alertSink, clock), reportReadyTemplateId: null }, claimed!, { ok: true });

    expect((await readMessage(id)).status).toBe('unknown');
  });

  it('keeps a text queued and alerts when the OA has no Zalo connection', async () => {
    const id = await insertOutboundMessage(database, { accountId: 'oa-1' });

    await runStep();

    expect(await readMessage(id)).toMatchObject({
      status: 'queued',
      available_at: new Date(NOW.getTime() + 60_000),
    });
    expect(alertSink.texts).toEqual(['[alert] No Zalo connection for OA oa-1. Run connect-zalo.']);
    expect(channel.texts).toEqual([]);
  });

  it('keeps an image queued without using an attempt while the photo storage is not configured', async () => {
    await connectOa('oa-1', 'a1');
    const id = await insertOutboundMessage(database, { photoKey: 'w/photo.jpg' });

    await runStep(90, null);

    expect(await readMessage(id)).toMatchObject({
      status: 'queued',
      attempts: 0,
      available_at: new Date(NOW.getTime() + 60_000),
      last_error: null,
    });
    expect(channel.sends).toEqual([]);
  });

  it('logs once per hour that the photo storage is off', async () => {
    await connectOa('oa-1', 'a1');
    await insertOutboundMessage(database, { photoKey: 'w/photo.jpg' });

    await runStep(90, null);
    clock.advanceBy(61_000);
    await runStep(90, null);
    clock.advanceBy(60 * 60_000);
    await runStep(90, null);

    expect(logLines).toEqual(['[config] photos is off; events wait.', '[config] photos is off; events wait.']);
  });

  it('fails an image whose photo is missing from the storage', async () => {
    await connectOa('oa-1', 'a1');
    const id = await insertOutboundMessage(database, { photoKey: 'w/gone.jpg' });

    await runStep();

    expect(channel.sends).toEqual([]);
    expect(await readMessage(id)).toMatchObject({ status: 'failed', last_error: 'photo_missing' });
  });

  it('fails an image for an admin removed while the photo is being read', async () => {
    await connectOa('oa-1', 'a1');
    const membershipId = await insertMembership();
    const id = await insertOutboundMessage(database, { photoKey: 'w/photo.jpg', adminMembershipId: membershipId });
    await photoStorage.put('w/photo.jpg', { bytes: new Uint8Array([0xff, 0xd8, 0xff]), contentType: 'image/jpeg' });
    const readPhoto = photoStorage.get.bind(photoStorage);
    photoStorage.get = async (key) => {
      await database.query(`DELETE FROM memberships WHERE id = '${membershipId}'`);
      return readPhoto(key);
    };

    await runStep();

    expect(channel.sends).toEqual([]);
    expect(await readMessage(id)).toMatchObject({ status: 'failed', last_error: 'membership_changed' });
  });

  it('fails admin-only content once the admin membership is gone', async () => {
    await connectOa('oa-1', 'a1');
    const membershipId = await insertMembership();
    await database.query(`DELETE FROM memberships WHERE id = '${membershipId}'`);
    const id = await insertOutboundMessage(database, { adminMembershipId: membershipId });

    await runStep();

    expect(channel.texts).toEqual([]);
    expect(await readMessage(id)).toMatchObject({ status: 'failed', last_error: 'membership_changed' });
    expect(alertSink.texts).toEqual([]);
  });

  it('counts texts still sending toward the per-minute limit', async () => {
    await connectOa('oa-1', 'a1');
    await insertOutboundMessage(database, {
      externalUserId: 'zu-lan',
      status: 'sending',
      attempts: 1,
      lockedUntil: new Date(NOW.getTime() + 60_000),
    });
    await insertOutboundMessage(database, { externalUserId: 'zu-hung' });

    await runStep(1);

    expect(channel.texts).toEqual([]);
  });

  it('counts a sent image as two calls toward the per-minute limit', async () => {
    await connectOa('oa-1', 'a1');
    const tenSecondsAgo = new Date(NOW.getTime() - 10_000);
    await insertOutboundMessage(database, { status: 'sent', sentAt: tenSecondsAgo, photoKey: 'a/1.jpg' });
    await insertOutboundMessage(database, { status: 'sent', sentAt: tenSecondsAgo });
    await insertOutboundMessage(database, { body: 'chờ' });

    await runStep(3);

    expect(channel.sends).toEqual([]);
  });

  it('keeps an image waiting when only one call is left', async () => {
    await connectOa('oa-1', 'a1');
    await insertOutboundMessage(database, { status: 'sent', sentAt: new Date(NOW.getTime() - 10_000) });
    await insertOutboundMessage(database, { photoKey: 'a/1.jpg' });

    await runStep(2);

    expect(channel.sends).toEqual([]);
  });

  it('fails a text and alerts after the tenth rate-limited attempt', async () => {
    await connectOa('oa-1', 'a1');
    const id = await insertOutboundMessage(database, { attempts: 9 });
    channel.nextTextResult = { ok: false, reason: 'rate_limited' };

    await runStep();

    expect((await readMessage(id)).status).toBe('failed');
    expect(alertSink.texts).toEqual([`[alert] Outbound message ${id} failed after 10 attempts.`]);
  });

  it('fails a text and alerts after the fifth attempt without a Zalo connection', async () => {
    const id = await insertOutboundMessage(database, { attempts: 4 });

    await runStep();

    expect((await readMessage(id)).status).toBe('failed');
    expect(alertSink.texts).toEqual([`[alert] Outbound message ${id} failed after 5 attempts.`]);
  });

  it('waits for the earlier text of a person before the next one is sent, even while it is sending', async () => {
    await connectOa('oa-1', 'a1');
    await insertOutboundMessage(database, { status: 'sending', lockedUntil: new Date(NOW.getTime() + 60_000), attempts: 1 });
    await insertOutboundMessage(database, { body: 'phần 2' });

    await runStep();

    expect(channel.texts).toEqual([]);
  });

  async function insertMembership(): Promise<string> {
    const [workspace] = await database.query<{ id: string }>(`INSERT INTO workspaces (name) VALUES ('W') RETURNING id`);
    const [user] = await database.query<{ id: string }>('INSERT INTO users DEFAULT VALUES RETURNING id');
    const [membership] = await database.query<{ id: string }>(
      `INSERT INTO memberships (workspace_id, user_id, role, display_name)
       VALUES ('${workspace?.id}', '${user?.id}', 'admin', 'Duy') RETURNING id`,
    );
    return membership?.id ?? '';
  }

  async function connectOa(accountId: string, accessToken: string): Promise<void> {
    const tokens = makeTokenPair({ accessToken });
    await storeConnection(pool, { channel: 'zalo-oa', accountId, tokens, storedAt: NOW }, ENCRYPTION_KEY);
  }

  async function readMessage(id: string): Promise<OutboundRow> {
    const [row] = await database.query<OutboundRow>(`SELECT * FROM outbound_messages WHERE id = '${id}'`);
    if (!row) throw new Error('message not found');
    return row;
  }

  function runStep(maxPerMinute = 90, storage: PhotoStorage | null = photoStorage): Promise<'processed' | 'idle'> {
    const alerts = new OperatorAlerts(alertSink, clock);
    return runOutboundStep({ database: pool, clock, alerts, notices, channel, photoStorage: storage, encryptionKey: ENCRYPTION_KEY, maxPerMinute, reportReadyTemplateId: null });
  }
});
