import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeReader } from '../fakes/fake-reader.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, makeJpeg, NOW, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import { insertMember } from './workspace-rows.ts';

const MINUTE_IN_MS = 60 * 1000;
const RECENT_MESSAGES_HEADER = 'Các tin nhắn gần đây';

describe('logging how the reader classified a message', () => {
  let harness: IntakeHarness;
  let loggedLines: string[];

  beforeEach(async () => {
    harness = await createIntakeHarness();
    loggedLines = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => {
      loggedLines.push(line);
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await harness.close();
  });

  it('logs the text question of an admin as answered by the admin chat', async () => {
    await insertMember(harness.database, { workspaceId: harness.workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    harness.reader.answerWith(makeReading([], { has_work_data: false, has_question: true }));

    await harness.receiveText('zu-duy', 'hôm nay ai gửi gì');

    expect(readIntakeLines()).toEqual([
      `[intake] message=${await readUserMessageId()} role=admin reader=ok situation=no_work_data items=0 has_question=true route=admin_chat`,
    ]);
  });

  it('logs the photo of a member saved as a reply', async () => {
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    harness.reader.answerWith(makeReading([makeItem()]));

    await harness.receivePhoto('zu-hung');

    expect(readIntakeLines()).toEqual([
      `[intake] message=${await readUserMessageId()} role=member reader=ok situation=saved items=1 has_question=false route=reply`,
    ]);
  });

  it('logs the text of an admin with work data and a question as a reply then the admin chat', async () => {
    await insertMember(harness.database, { workspaceId: harness.workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    harness.reader.answerWith(makeReading([makeItem()], { has_question: true }));

    await harness.receiveText('zu-duy', 'Đổ dầu 1.250.000đ. Hôm nay tổng bao nhiêu?');

    expect(readIntakeLines()).toEqual([
      `[intake] message=${await readUserMessageId()} role=admin reader=ok situation=saved items=1 has_question=true route=reply_then_admin_chat`,
    ]);
  });

  it('logs a reader timeout as unresolved', async () => {
    harness.reader.failWith('timeout');

    await harness.receiveText('zu-hung', 'Đổ dầu 500.000đ');

    expect(readIntakeLines()).toEqual([
      `[intake] message=${await readUserMessageId()} role=member reader=timeout situation=unresolved items=0 has_question=false route=reply`,
    ]);
  });

  it('logs a maintenance reading without a plate as unresolved', async () => {
    harness.reader.answerWith(makeReading([makeItem({ category: 'bảo dưỡng', maintenance_item: 'lốp', vehicle_plate: null })]));

    await harness.receiveText('zu-hung', 'Thay lốp 3.500.000đ');

    expect(readIntakeLines()).toEqual([
      `[intake] message=${await readUserMessageId()} role=member reader=ok situation=unresolved items=1 has_question=false route=reply`,
    ]);
  });

  it('logs an unclear photo as needing an explanation', async () => {
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    harness.reader.answerWith(makeReading([], { has_work_data: false, needs_explanation: true }));

    await harness.receivePhoto('zu-hung');

    expect(readIntakeLines()).toEqual([
      `[intake] message=${await readUserMessageId()} role=member reader=ok situation=needs_explanation items=0 has_question=false route=reply`,
    ]);
  });

  it('logs the reading of the reread when a text is saved only after it', async () => {
    const unclear = makeReading([], { has_work_data: false, needs_explanation: true });
    const reader = new FakeReader(({ text }) => ({
      ok: true,
      json: text?.startsWith(RECENT_MESSAGES_HEADER) ? makeReading([makeItem()]) : unclear,
    }));
    const sentAt = new Date(NOW.getTime() - 2 * MINUTE_IN_MS).toISOString();
    await insertInboundEvent(harness.database, { externalUserId: 'zu-hung', text: 'Đổ dầu', sentAt });
    await harness.runInbound({ reader });
    loggedLines.length = 0;

    await harness.receiveText('zu-hung', '500.000đ', { reader });

    expect(readIntakeLines()).toEqual([
      `[intake] message=${await readUserMessageId()} role=member reader=ok situation=saved items=1 has_question=false route=reply`,
    ]);
  });

  it('logs the explanation of a waiting photo', async () => {
    await sendUnclearPhoto();

    await harness.receiveText('zu-hung', 'Đổ dầu 500.000đ');

    expect(readIntakeLines()).toEqual([
      `[intake] message=${await readUserMessageId()} role=member reader=ok situation=saved items=1 has_question=false route=reply`,
    ]);
  });

  async function sendUnclearPhoto(): Promise<void> {
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    harness.reader.answerWith(makeReading([], { has_work_data: false, needs_explanation: true }));
    await harness.receivePhoto('zu-hung');
    harness.reader.answerWith(makeReading([makeItem()]));
    loggedLines.length = 0;
  }

  async function readUserMessageId(): Promise<string> {
    const [message] = await harness.database.query<{ id: string }>(`SELECT id FROM messages WHERE author = 'user' ORDER BY created_at DESC LIMIT 1`);
    if (!message) throw new Error('no user message stored');
    return message.id;
  }

  function readIntakeLines(): string[] {
    return loggedLines.filter((line) => line.startsWith('[intake]'));
  }
});
