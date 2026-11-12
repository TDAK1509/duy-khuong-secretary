import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Reading } from '../../src/app/reading/reading.ts';
import { makeItem, makeReading, type ItemOverrides } from '../unit/reading/make-reading.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, makeJpeg, NOW, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const OUTAGE_REPLY =
  'Tôi đọc ảnh này chưa chắc chắn nên chưa lưu. Bạn chụp lại gần hơn, đủ sáng, hoặc nhắn rõ nội dung, ví dụ: "Thay dầu máy 850.000đ ngày 30/10".';
const INSPECTION_TITLE = 'Chứng nhận kiểm định an toàn kỹ thuật và bảo vệ môi trường xe cơ giới';

describe('saving what the reader returns', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;
  let hungUserId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId, hungUserId } = harness);
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('makes exactly one reader request for a text with work data', async () => {
    harness.reader.answerWith(makeReading([makeFuelItem()]));

    await harness.receiveText('zu-hung', 'Đổ dầu 1.250.000đ ngày 30/10, hóa đơn 0001234');

    expect(harness.reader.requests).toHaveLength(1);
  });

  it('makes exactly one reader request for a photo with work data', async () => {
    harness.reader.answerWith(makeReading([makeTireItem()]));

    await harness.receivePhoto('zu-hung', 'Lốp mới thay cho xe 29C-123.45, giá 3.500.000đ');

    expect(harness.reader.requests).toHaveLength(1);
  });

  it('saves the fuel item of the reading for the sender', async () => {
    harness.reader.answerWith(makeReading([makeFuelItem()]));

    await harness.receivePhoto('zu-hung');

    expect(
      await database.query(
        `SELECT workspace_id, user_id, category, amount_vnd::int AS amount_vnd,
           to_char(occurred_on, 'YYYY-MM-DD') AS occurred_on
         FROM records`,
      ),
    ).toEqual([
      {
        workspace_id: workspaceId,
        user_id: hungUserId,
        category: 'đổ xăng dầu',
        amount_vnd: 1250000,
        occurred_on: '2026-10-30',
      },
    ]);
  });

  it('saves the fuel item of a text for the sender', async () => {
    harness.reader.answerWith(makeReading([makeFuelItem()]));

    await harness.receiveText('zu-hung', 'Đổ dầu 1.250.000đ ngày 30/10, hóa đơn 0001234');

    expect(
      await database.query(
        `SELECT user_id, category, amount_vnd::int AS amount_vnd, to_char(occurred_on, 'YYYY-MM-DD') AS occurred_on
         FROM records`,
      ),
    ).toEqual([{ user_id: hungUserId, category: 'đổ xăng dầu', amount_vnd: 1250000, occurred_on: '2026-10-30' }]);
  });

  it('saves a category outside the old list', async () => {
    harness.reader.answerWith(makeReading([makeFuelItem({ category: 'phiếu cân' })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT category FROM records')).toEqual([{ category: 'phiếu cân' }]);
  });

  it('names the printed title of a certificate in the reply', async () => {
    harness.reader.answerWith(makeReading([makeInspectionCertificate()]));

    await harness.receivePhoto('zu-hung');
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([
      ['zu-hung', `Đã lưu: ${INSPECTION_TITLE}, xe 29C12345.`],
    ]);
  });

  it('stores the printed title of a certificate', async () => {
    harness.reader.answerWith(makeReading([makeInspectionCertificate()]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT category, document_title FROM records')).toEqual([
      { category: 'kiểm định xe', document_title: INSPECTION_TITLE },
    ]);
  });

  it('saves a tire photo with its barcode and sends nothing else', async () => {
    harness.reader.answerWith(makeReading([makeTireItem()]));
    await insertInboundEvent(database, {
      externalUserId: 'zu-hung',
      kind: 'images',
      imageUrls: [PHOTO_URL],
      caption: 'Lốp mới thay cho xe 29C-123.45, giá 3.500.000đ',
      externalEventId: 'zmsg-1',
    });

    await harness.runInbound();
    await harness.sendAllQueuedTexts();

    expect(harness.channel.texts.map(({ to, text, quoteMessageId }) => ({ to: to.externalUserId, text, quoteMessageId }))).toEqual([
      {
        to: 'zu-hung',
        text: 'Đã lưu: Bảo dưỡng: lốp, xe 29C12345, mã 8936012845678, 3.500.000đ.',
        quoteMessageId: 'zmsg-1',
      },
    ]);
  });

  it('replies to one saved item with what was saved', async () => {
    harness.reader.answerWith(makeReading([makeFuelItem()]));

    await harness.receivePhoto('zu-hung');
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([['zu-hung', 'Đã lưu: Đổ xăng dầu, số 0001234, 1.250.000đ, ngày 30/10/2026.']]);
  });

  it('marks a saved message as accepted', async () => {
    harness.reader.answerWith(makeReading([makeFuelItem()]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query(`SELECT submission_status FROM messages WHERE author = 'user'`)).toEqual([
      { submission_status: 'accepted' },
    ]);
  });

  it('gives the outage reply when the reader times out', async () => {
    harness.reader.failWith('timeout');

    await harness.receiveText('zu-hung', 'Đổ dầu 1.250.000đ ngày 30/10');
    await harness.sendAllQueuedTexts();

    expect(sentTexts()).toEqual([['zu-hung', OUTAGE_REPLY]]);
  });

  it('marks a text as unresolved when the reader times out', async () => {
    harness.reader.failWith('timeout');

    await harness.receiveText('zu-hung', 'Đổ dầu 1.250.000đ ngày 30/10');

    expect(await database.query(`SELECT submission_status FROM messages WHERE author = 'user'`)).toEqual([
      { submission_status: 'unresolved' },
    ]);
  });

  it('gives the outage reply when the reader is unavailable', async () => {
    harness.reader.failWith('unavailable');

    await harness.receiveText('zu-hung', 'Đổ dầu 1.250.000đ ngày 30/10');
    await harness.sendAllQueuedTexts();

    expect(sentTexts()).toEqual([['zu-hung', OUTAGE_REPLY]]);
  });

  it('gives the outage reply when the reader output breaks the reading schema', async () => {
    harness.reader.answerWith({ items: 'none' });

    await harness.receiveText('zu-hung', 'Đổ dầu 1.250.000đ ngày 30/10');
    await harness.sendAllQueuedTexts();

    expect(sentTexts()).toEqual([['zu-hung', OUTAGE_REPLY]]);
  });

  it('marks an unresolved message as unresolved', async () => {
    harness.reader.failWith('timeout');

    await harness.receivePhoto('zu-hung');

    expect(await database.query(`SELECT submission_status FROM messages WHERE author = 'user'`)).toEqual([
      { submission_status: 'unresolved' },
    ]);
  });

  it('replies to two saved items with one line for each', async () => {
    const toll = (documentNumber: string, amount: number) =>
      makeItem({ category: 'phí cầu đường', document_number: documentNumber, amount_vnd: amount, occurred_on: '2026-10-30' });
    harness.reader.answerWith(makeReading([toll('0012345', 35000), toll('0012346', 40000)]));

    await harness.receivePhoto('zu-hung');
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([
      [
        'zu-hung',
        [
          'Đã lưu 2 mục:',
          '- Phí cầu đường, số 0012345 · 35.000đ · 30/10/2026',
          '- Phí cầu đường, số 0012346 · 40.000đ · 30/10/2026',
        ].join('\n'),
      ],
    ]);
  });

  it('sends the saved reply only to the Zalo account of the sender', async () => {
    await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    harness.reader.answerWith(makeReading([makeFuelItem()]));

    await harness.receivePhoto('zu-hung');
    await harness.sendQueuedTexts();
    await harness.sendQueuedTexts();

    expect(await database.query('SELECT external_user_id FROM outbound_messages')).toEqual([
      { external_user_id: 'zu-hung' },
    ]);
    expect(harness.channel.texts.filter((sent) => sent.to.externalUserId === 'zu-lan')).toEqual([]);
  });

  it('sends a text to the reader as text without an image', async () => {
    await harness.receiveText('zu-hung', 'Đổ dầu 500.000đ');

    expect(harness.reader.requests.map(({ text, image }) => ({ text, image }))).toEqual([
      { text: 'Đổ dầu 500.000đ', image: null },
    ]);
  });

  it('sends a photo to the reader with its caption', async () => {
    await harness.receivePhoto('zu-hung', 'Xe 29C-123.45');

    expect(harness.reader.requests.map(({ text, image }) => [text, image?.contentType])).toEqual([
      ['Xe 29C-123.45', 'image/jpeg'],
    ]);
  });

  function makeQuestionOnly(): Reading {
    return makeReading([], { has_work_data: false, has_question: true });
  }

  it('answers the question of a member with the nothing-to-save reply', async () => {
    harness.reader.answerWith(makeQuestionOnly());

    await harness.receiveText('zu-hung', 'Hôm qua tôi gửi gì?');
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([
      [
        'zu-hung',
        'Trợ lý chưa thấy thông tin công việc cần lưu trong tin nhắn này. Nếu cần lưu, bạn nhắn rõ đây là việc gì, cho xe nào, bao nhiêu tiền nếu có nhé.',
      ],
    ]);
  });

  it('saves no record for the question of a member', async () => {
    harness.reader.answerWith(makeQuestionOnly());

    await harness.receiveText('zu-hung', 'Hôm qua tôi gửi gì?');

    expect(await database.query('SELECT 1 FROM records')).toEqual([]);
  });

  it('saves the data of a member who also asks a question', async () => {
    harness.reader.answerWith(makeReading([makeFuelItem()], { has_question: true }));

    await harness.receivePhoto('zu-hung', 'Lưu giúp tôi, còn bao nhiêu tiền?');

    expect(await database.query('SELECT 1 FROM records')).toHaveLength(1);
  });

  it('sends only the saved reply to a member who also asks a question', async () => {
    harness.reader.answerWith(makeReading([makeFuelItem()], { has_question: true }));

    await harness.receivePhoto('zu-hung', 'Lưu giúp tôi, còn bao nhiêu tiền?');
    await harness.sendQueuedTexts();
    await harness.sendQueuedTexts();

    expect(harness.channel.texts).toHaveLength(1);
    expect(harness.channel.texts[0]?.text).toMatch(/^Đã lưu: Đổ xăng dầu/);
  });

  it('stores the identifiers normalized', async () => {
    harness.reader.answerWith(makeReading([makeItem({ identifiers: ['DT2024-889'] })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT identifiers FROM records')).toEqual([{ identifiers: ['DT2024889'] }]);
  });

  it('stores the plate normalized', async () => {
    harness.reader.answerWith(makeReading([makeItem({ vehicle_plate: '29C-123.45' })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT vehicle_plate FROM records')).toEqual([{ vehicle_plate: '29C12345' }]);
  });

  it('stores the document number normalized', async () => {
    harness.reader.answerWith(makeReading([makeItem({ document_number: 'aa/26e-0001234' })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT document_number FROM records')).toEqual([{ document_number: 'AA26E0001234' }]);
  });

  it('stores the maintenance item trimmed and lowercased', async () => {
    const oilChange = makeItem({ category: 'bảo dưỡng', maintenance_item: ' Dầu  Máy ', vehicle_plate: '29C-123.45' });
    harness.reader.answerWith(makeReading([oilChange]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT maintenance_item FROM records')).toEqual([{ maintenance_item: 'dầu máy' }]);
  });

  function makePlatelessMaintenanceItem() {
    return makeItem({ category: 'bảo dưỡng', maintenance_item: 'dầu máy', vehicle_plate: null });
  }

  it('saves nothing for a maintenance item without a plate', async () => {
    harness.reader.answerWith(makeReading([makePlatelessMaintenanceItem()]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT 1 FROM records')).toEqual([]);
  });

  it('asks for the plate when a maintenance item has none', async () => {
    harness.reader.answerWith(makeReading([makePlatelessMaintenanceItem()]));

    await harness.receivePhoto('zu-hung');
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([
      [
        'zu-hung',
        'Giấy tờ bảo dưỡng này chưa có biển số xe nên tôi chưa lưu. Bạn gửi lại ảnh kèm tin nhắn ghi biển số xe, ví dụ: 29C-123.45.',
      ],
    ]);
  });

  it('saves no record at all when one maintenance item has no plate', async () => {
    harness.reader.answerWith(makeReading([makeFuelItem(), makePlatelessMaintenanceItem()]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT 1 FROM records')).toEqual([]);
    expect(await database.query('SELECT status FROM inbound_events')).toEqual([{ status: 'done' }]);
  });

  it('marks a maintenance message without a plate as unresolved', async () => {
    harness.reader.answerWith(makeReading([makePlatelessMaintenanceItem()]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query(`SELECT submission_status FROM messages WHERE author = 'user'`)).toEqual([
      { submission_status: 'unresolved' },
    ]);
  });

  it('saves a fuel item without a plate', async () => {
    harness.reader.answerWith(makeReading([makeItem({ category: 'đổ xăng dầu', vehicle_plate: null })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT vehicle_plate FROM records')).toEqual([{ vehicle_plate: null }]);
  });

  it('keeps every detail the reader returned', async () => {
    const details = [
      { label: 'Số lít', value: '50', number: 50, unit: 'l' as const },
      { label: 'Tên trạm', value: 'Petrolimex Long Biên', number: null, unit: null },
    ];
    harness.reader.answerWith(makeReading([makeFuelItem({ details })]));

    await harness.receiveText('zu-hung', 'Đổ dầu 1.250.000đ ngày 30/10, hóa đơn 0001234');

    expect(await database.query('SELECT details FROM records')).toEqual([{ details }]);
  });

  it('stores the label, printed value, number and unit of a detail', async () => {
    const weight = { label: 'Trọng lượng hàng', value: '27,420 Kg', number: 27420, unit: 'kg' as const };
    harness.reader.answerWith(makeReading([makeFuelItem({ details: [weight] })]));

    await harness.receiveText('zu-hung', 'Phiếu cân 27,420 Kg');

    expect(await database.query('SELECT details FROM records')).toEqual([{ details: [weight] }]);
  });

  it('saves the record with a null number and unit when the unit is unknown', async () => {
    const reading = makeReading([makeFuelItem()]);
    const detail = { label: 'Trọng lượng hàng', value: '27,41 tấn', number: 27.41, unit: 'tấn', meaning: null, item: null, date_time: null };
    harness.reader.answerWith({ ...reading, items: [{ ...reading.items[0], details: [detail] }] });

    await harness.receiveText('zu-hung', 'Phiếu cân 27,41 tấn');

    expect(await database.query('SELECT details FROM records')).toEqual([
      { details: [{ label: 'Trọng lượng hàng', value: '27,41 tấn', number: null, unit: null }] },
    ]);
  });

  it('copies the display name of the sender onto the record', async () => {
    harness.reader.answerWith(makeReading([makeFuelItem()]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT sender_name FROM records')).toEqual([{ sender_name: 'Hùng' }]);
  });

  it('builds the summary from the fields of the reading', async () => {
    const tyre = makeItem({
      category: 'bảo dưỡng',
      maintenance_item: 'lốp',
      vehicle_plate: '29C-123.45',
      identifiers: ['DT2024-889'],
      document_number: null,
    });
    harness.reader.answerWith(makeReading([tyre]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT summary FROM records')).toEqual([
      { summary: 'Bảo dưỡng: lốp, xe 29C12345, mã DT2024889' },
    ]);
  });

  async function processSavedPhotoAgain(): Promise<void> {
    harness.reader.answerWith(makeReading([makeFuelItem()]));
    await harness.receivePhoto('zu-hung');
    const expiredLock = new Date(NOW.getTime() - 60_000).toISOString();
    await database.query(`UPDATE inbound_events SET status = 'processing', locked_until = '${expiredLock}'`);
    harness.reader.requests.splice(0);
    await harness.runInbound();
  }

  it('sends no second reply when a saved message is processed again', async () => {
    await processSavedPhotoAgain();

    expect(await database.query(`SELECT 1 FROM messages WHERE author = 'bot'`)).toHaveLength(1);
    expect(await database.query('SELECT 1 FROM outbound_messages')).toHaveLength(1);
  });

  it('does not read the photo again when a saved message is processed again', async () => {
    await processSavedPhotoAgain();

    expect(harness.reader.requests).toHaveLength(0);
  });

  it('saves nothing more when a saved message is processed again', async () => {
    await processSavedPhotoAgain();

    expect(await database.query('SELECT 1 FROM records')).toHaveLength(1);
    expect(await database.query('SELECT status FROM inbound_events')).toEqual([{ status: 'done' }]);
  });

  it('saves nothing when the worker lost its claim while the reader reads', async () => {
    harness.reader.answerWith(makeReading([makeFuelItem()]));
    const { reader } = harness;
    const readOnce = reader.read.bind(reader);
    reader.read = async (request) => {
      await database.query(`UPDATE inbound_events SET attempts = attempts + 1`);
      return readOnce(request);
    };

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT 1 FROM records')).toEqual([]);
    expect(await database.query(`SELECT 1 FROM messages WHERE author = 'bot'`)).toEqual([]);
    expect(await database.query('SELECT 1 FROM outbound_messages')).toEqual([]);
  });

  it('keeps a message waiting while the reader is not configured', async () => {
    await insertInboundEvent(database, { externalUserId: 'zu-hung', text: 'Đổ dầu 500.000đ' });

    await harness.runInbound({ reader: null });

    expect(await database.query('SELECT status, attempts FROM inbound_events')).toEqual([
      { status: 'queued', attempts: 0 },
    ]);
    expect(await database.query('SELECT 1 FROM outbound_messages')).toEqual([]);
  });

  it('saves a record whose maintenance item is blank, without an item', async () => {
    const blankItem = makeItem({ category: 'bảo dưỡng', maintenance_item: '  ', vehicle_plate: '29C-123.45' });
    harness.reader.answerWith(makeReading([blankItem]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT category, maintenance_item FROM records')).toEqual([
      { category: 'bảo dưỡng', maintenance_item: null },
    ]);
  });

  it('keeps the maintenance item of a record whatever its category', async () => {
    const tireChange = makeItem({ category: 'thay phụ tùng', maintenance_item: 'Lốp', vehicle_plate: '29C-123.45' });
    harness.reader.answerWith(makeReading([tireChange]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT category, maintenance_item FROM records')).toEqual([
      { category: 'thay phụ tùng', maintenance_item: 'lốp' },
    ]);
  });

  it('asks for the plate when a record of any category has a maintenance item and no plate', async () => {
    const tireChange = makeItem({ category: 'thay phụ tùng', maintenance_item: 'lốp', vehicle_plate: null });
    harness.reader.answerWith(makeReading([tireChange]));

    await harness.receivePhoto('zu-hung');
    await harness.sendQueuedTexts();

    expect(await database.query('SELECT 1 FROM records')).toEqual([]);
    expect(sentTexts()).toEqual([
      [
        'zu-hung',
        'Giấy tờ bảo dưỡng này chưa có biển số xe nên tôi chưa lưu. Bạn gửi lại ảnh kèm tin nhắn ghi biển số xe, ví dụ: 29C-123.45.',
      ],
    ]);
  });

  it('gives the nothing-to-save reply when work data has no item', async () => {
    harness.reader.answerWith(makeReading([], { has_work_data: true }));

    await harness.receiveText('zu-hung', 'Đổ dầu');
    await harness.sendQueuedTexts();

    expect(harness.channel.texts.map((sent) => sent.text)).toEqual([
      'Trợ lý chưa thấy thông tin công việc cần lưu trong tin nhắn này. Nếu cần lưu, bạn nhắn rõ đây là việc gì, cho xe nào, bao nhiêu tiền nếu có nhé.',
    ]);
    expect(await database.query('SELECT 1 FROM records')).toEqual([]);
  });

  it('does not read a text again when it is processed again', async () => {
    await harness.receiveText('zu-hung', 'Đổ dầu 500.000đ');
    const expiredLock = new Date(NOW.getTime() - 60_000).toISOString();
    await database.query(`UPDATE inbound_events SET status = 'processing', locked_until = '${expiredLock}'`);

    await harness.runInbound();

    expect(harness.reader.requests).toHaveLength(1);
    expect(await database.query(`SELECT 1 FROM messages WHERE author = 'bot'`)).toHaveLength(1);
  });

  function makeInspectionCertificate() {
    return makeItem({
      category: 'kiểm định xe',
      document_title: INSPECTION_TITLE,
      vehicle_plate: '29C-123.45',
      amount_vnd: null,
      occurred_on: null,
    });
  }

  function makeTireItem() {
    return makeItem({
      category: 'bảo dưỡng',
      maintenance_item: 'lốp',
      vehicle_plate: '29C-123.45',
      amount_vnd: 3500000,
      occurred_on: null,
      identifiers: ['8936012845678'],
    });
  }

  function makeFuelItem(overrides: ItemOverrides = {}) {
    return makeItem({
      category: 'đổ xăng dầu',
      amount_vnd: 1250000,
      occurred_on: '2026-10-30',
      document_number: '0001234',
      ...overrides,
    });
  }

  function sentTexts(): string[][] {
    return harness.channel.texts.map((sent) => [sent.to.externalUserId, sent.text]);
  }
});
