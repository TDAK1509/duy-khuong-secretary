import { createInboundHandler } from '../../../src/app/processing/handle-inbound-event.ts';
import { HeldEvents } from '../../../src/app/processing/held-events.ts';
import { OffGroupNotices } from '../../../src/app/processing/off-group-notices.ts';
import { runInboundStep } from '../../../src/app/processing/inbound-step.ts';
import { OperatorAlerts } from '../../../src/app/alerts/operator-alerts.ts';
import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import type { Clock } from '../../../src/services/clock/clock.ts';
import { CountingChatService } from './counting-chat-service.ts';
import { FakeFileStorage } from './fake-file-storage.ts';
import { MemoryPhotoStorage } from './memory-photo-storage.ts';
import { NoWorkDataReader } from './no-work-data-reader.ts';
import { FIXED_NOW } from './seed-ids.ts';
import { StubMessagingChannel } from './stub-messaging-channel.ts';

const DRIVER_EVENT_ID = 'aaaaaaaa-0019-4000-8000-0000000000f1';
const ONE_MINUTE_MS = 60_000;
const CLOCK: Clock = { now: () => FIXED_NOW };

export type DriverMessage = { kind: 'text'; text: string } | { kind: 'photo'; caption: string };

export type DriverStep = { chat: CountingChatService; reader: NoWorkDataReader };

export type DriverStepResult = DriverStep & { replyTexts: string[] };

export async function runDriverStep(databases: { owner: PostgresPool; step: PostgresPool }, message: DriverMessage): Promise<DriverStepResult> {
  await queueDriverEvent(databases.owner, message);
  const step = { chat: new CountingChatService(), reader: new NoWorkDataReader() };
  await runInboundStep(buildInboundDependencies(databases.step, step));
  await assertEventFinished(databases.owner);
  return { ...step, replyTexts: await readReplyTexts(databases.owner) };
}

async function queueDriverEvent(owner: PostgresPool, message: DriverMessage): Promise<void> {
  const receivedAt = new Date(FIXED_NOW.getTime() - ONE_MINUTE_MS);
  await owner.query(
    `INSERT INTO inbound_events (id, channel, account_id, external_event_id, external_user_id, kind, payload, received_at, available_at)
     VALUES ($1, 'zalo-oa', 'seed-oa', 'SAFE-A-DRIVER-EVENT', 'seed-zalo-driver', $2, $3, $4, $4)`,
    [DRIVER_EVENT_ID, message.kind === 'text' ? 'text' : 'images', JSON.stringify(buildPayload(message)), receivedAt],
  );
}

function buildPayload(message: DriverMessage): object {
  const sentAt = FIXED_NOW.toISOString();
  if (message.kind === 'text') return { text: message.text, sent_at: sentAt };
  return { image_urls: ['https://files.leak-test.invalid/driver-photo.jpg'], caption: message.caption, sent_at: sentAt };
}

function buildInboundDependencies(database: PostgresPool, { chat, reader }: DriverStep) {
  return {
    database,
    clock: CLOCK,
    alerts: new OperatorAlerts({ notify: async () => {} }, CLOCK),
    notices: new OffGroupNotices(CLOCK, () => {}),
    held: new HeldEvents(),
    handler: createInboundHandler({
      channel: new StubMessagingChannel(),
      clock: CLOCK,
      database,
      encryptionKey: 'leak-test-encryption-key',
      fileStorage: new FakeFileStorage(),
      photoStorage: new MemoryPhotoStorage(),
      reader,
      dropOffReader: null,
      chats: { adminChat: chat },
    }),
  };
}

async function assertEventFinished(owner: PostgresPool): Promise<void> {
  const { rows } = await owner.query<{ status: string; last_error: string | null }>(
    'SELECT status, last_error FROM inbound_events WHERE id = $1',
    [DRIVER_EVENT_ID],
  );
  if (rows[0]?.status !== 'done') throw new Error(`the driver event did not finish: ${JSON.stringify(rows[0])}`);
}

async function readReplyTexts(owner: PostgresPool): Promise<string[]> {
  const { rows } = await owner.query<{ text: string }>(
    `SELECT reply.text FROM messages reply JOIN messages driver_message ON reply.reply_to = driver_message.id
     WHERE driver_message.inbound_event_id = $1 ORDER BY reply.created_at`,
    [DRIVER_EVENT_ID],
  );
  return rows.map((row) => row.text);
}
