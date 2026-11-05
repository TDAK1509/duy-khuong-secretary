import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeReader } from '../fakes/fake-reader.ts';
import type { FakeReaderSlots } from '../fakes/fake-reader-slots.ts';
import type { ReaderRequest, ReaderResult } from '../../src/services/reading/reader-service.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, makeJpeg, NOW, type IntakeHarness } from './intake-harness.ts';
import { insertMember } from './workspace-rows.ts';

const PHOTO_A_URL = 'https://z.test/a.jpg';
const DUY_LAST_WROTE_AT = new Date('2026-11-01T10:00:00+07:00');
const MINUTE_IN_MS = 60 * 1000;
const PLATE_TEXT = 'xe 29C-123.45';
const RECENT_MESSAGES_HEADER = 'Các tin nhắn gần đây của người gửi';
const UNCLEAR = makeReading([], { has_work_data: false, needs_explanation: true });
const TIRE_ITEM = makeReading([
  makeItem({ category: 'bảo dưỡng', maintenance_item: 'lốp', vehicle_plate: '29C-123.45', amount_vnd: 3500000, occurred_on: null }),
]);

describe('reading an unclear photo with the recent texts of the sender', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    const { database, workspaceId } = harness;
    await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin', lastInboundAt: DUY_LAST_WROTE_AT });
    harness.channel.attachments.set(PHOTO_A_URL, { ok: true, bytes: makeJpeg(1000) });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('reads an unclear photo again with the earlier text of the sender', async () => {
    await sendTextSentMinutesAgo('zu-hung', PLATE_TEXT, 2);
    const readers = makeContextReaders();

    await sendPhotoA('zu-hung', readers);

    const request = readers.cheap[0].requests.at(-1);
    expect(request?.image?.bytes).toEqual(makeJpeg(1000));
    expect(request?.text).toBe(`${RECENT_MESSAGES_HEADER}, từ cũ đến mới:\n- ${PLATE_TEXT}`);
  });

  async function sendTextSentMinutesAgo(externalUserId: string, text: string, minutesAgo: number): Promise<void> {
    const sentAt = new Date(NOW.getTime() - minutesAgo * MINUTE_IN_MS).toISOString();
    await insertInboundEvent(harness.database, { externalUserId, text, sentAt });
    await harness.runInbound({ readers: makeContextReaders() });
  }

  async function sendPhotoA(externalUserId: string, readers: FakeReaderSlots, caption: string | null = null): Promise<void> {
    await insertInboundEvent(harness.database, { externalUserId, kind: 'images', imageUrls: [PHOTO_A_URL], externalEventId: 'zmsg-1', caption });
    await harness.runInbound({ readers });
  }
});

function makeContextReaders(): FakeReaderSlots {
  return makeReadersAnswering(({ text }) => (text?.startsWith(RECENT_MESSAGES_HEADER) ? TIRE_ITEM : UNCLEAR));
}

function makeReadersAnswering(respond: (request: ReaderRequest) => unknown): FakeReaderSlots {
  const makeReader = (label: string) => new FakeReader(label, (request): ReaderResult => ({ ok: true, json: respond(request) }));
  return { cheap: [makeReader('cheap-1'), makeReader('cheap-2')], strong: [makeReader('strong-1'), makeReader('strong-2')] };
}
