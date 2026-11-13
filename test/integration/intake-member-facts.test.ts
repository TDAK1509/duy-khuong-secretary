import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeReader } from '../fakes/fake-reader.ts';
import type { ReaderRequest, ReaderResult } from '../../src/services/reading/reader-service.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, makeJpeg, NOW, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import { insertMemberMemory } from './member-memory-rows.ts';
import { insertMember, insertMembership, insertWorkspace } from './workspace-rows.ts';

const PLATE_FACT = 'Lái xe biển số 93A-1234';
const MINUTE_IN_MS = 60 * 1000;
const RECENT_MESSAGES_HEADER = 'Các tin nhắn gần đây của người gửi';
const UNCLEAR = makeReading([], { has_work_data: false, needs_explanation: true });
const TIRE_ITEM = makeReading([
  makeItem({ category: 'bảo dưỡng', maintenance_item: 'lốp', vehicle_plate: '29C-123.45', amount_vnd: 3500000, occurred_on: null }),
]);
const EXPLANATION = 'Lốp mới thay cho xe, giá 3.500.000đ';
const RULE_18_START = '18. Thông tin quản lý đã lưu về người gửi:';
const RULE_18_WITH_PLATE_FACT = '18. Thông tin quản lý đã lưu về người gửi: ["Lái xe biển số 93A-1234"]. Danh sách này';

describe('giving the reader the facts saved about the sender', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    await insertMemberMemory(harness.database, { workspaceId: harness.workspaceId, userId: harness.hungUserId, markdown: `- ${PLATE_FACT}` });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('shows the reader the facts of the member when the member sends a photo', async () => {
    await harness.receivePhoto('zu-hung');

    const [request] = harness.reader.requests;
    expect(request?.system).toContain(RULE_18_WITH_PLATE_FACT);
  });

  it('shows the reader no facts when another member sends a photo', async () => {
    const { database, workspaceId } = harness;
    await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });

    await harness.receivePhoto('zu-lan');

    const [request] = harness.reader.requests;
    expect(request?.system).not.toContain(RULE_18_START);
  });

  it('shows the reader only the facts of the active workspace', async () => {
    const { database, hungUserId } = harness;
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải khác');
    await insertMembership(database, { workspaceId: otherWorkspaceId, userId: hungUserId, displayName: 'Hùng' });
    await insertMemberMemory(database, { workspaceId: otherWorkspaceId, userId: hungUserId, markdown: '- Lái xe biển số 51C-55555' });

    await harness.receivePhoto('zu-hung');

    const [request] = harness.reader.requests;
    expect(request?.system).toContain(RULE_18_WITH_PLATE_FACT);
    expect(request?.system).not.toContain('51C-55555');
  });

  it('shows the reader the facts when the member explains a photo', async () => {
    harness.reader.answerWith(UNCLEAR);
    await harness.receivePhoto('zu-hung');
    expect(await readPhotoStatuses()).toEqual([{ status: 'needs_explanation' }]);

    await harness.receiveText('zu-hung', EXPLANATION);

    const request = harness.reader.requests.at(-1);
    expect(harness.reader.requests).toHaveLength(2);
    expect(request?.image?.bytes).toEqual(makeJpeg(1000));
    expect(request?.text).toBe(`Lời giải thích của người gửi cho ảnh này:\n${EXPLANATION}`);
    expect(request?.system).toContain(RULE_18_WITH_PLATE_FACT);
  });

  function readPhotoStatuses(): Promise<object[]> {
    return harness.database.query('SELECT submission_status AS status FROM messages WHERE image_key IS NOT NULL');
  }

  it('shows the reader the facts when it reads again with the recent messages', async () => {
    const reader = makeReaderAnsweringWithRecentMessages();
    await sendTextSentMinutesAgo('Lốp mới thay', 1, reader);

    await harness.receiveText('zu-hung', 'xe 29C-123.45, giá 3.500.000đ', { reader });

    expect(reader.requests.at(-1)?.text).toContain(RECENT_MESSAGES_HEADER);
    expect(reader.requests.at(-1)?.system).toContain(RULE_18_WITH_PLATE_FACT);
  });

  async function sendTextSentMinutesAgo(text: string, minutesAgo: number, reader: FakeReader): Promise<void> {
    const sentAt = new Date(NOW.getTime() - minutesAgo * MINUTE_IN_MS).toISOString();
    await insertInboundEvent(harness.database, { externalUserId: 'zu-hung', text, sentAt });
    await harness.runInbound({ reader });
  }

  function makeReaderAnsweringWithRecentMessages(): FakeReader {
    return new FakeReader(({ text }: ReaderRequest): ReaderResult => ({
      ok: true,
      usage: null,
      json: text?.startsWith(RECENT_MESSAGES_HEADER) ? TIRE_ITEM : UNCLEAR,
    }));
  }
});
