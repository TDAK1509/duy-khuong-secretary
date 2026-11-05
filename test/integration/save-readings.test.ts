import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Reading, ReadingItem } from '../../src/app/reading/reading.ts';
import type { FakeReader } from '../fakes/fake-reader.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, makeJpeg, NOW, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const INSPECTION_TITLE = 'Chứng nhận kiểm định an toàn kỹ thuật và bảo vệ môi trường xe cơ giới';

describe('saving what two readers agree on', () => {
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

  it('saves an agreed fuel item for the sender', async () => {
    answerPair(harness.readers.cheap, makeReading([makeFuelItem()]));

    await harness.receivePhoto('zu-hung');

    expect(
      await database.query(
        `SELECT workspace_id, user_id, category, amount_vnd::int AS amount_vnd,
           to_char(occurred_on, 'YYYY-MM-DD') AS occurred_on, read_by
         FROM records`,
      ),
    ).toEqual([
      {
        workspace_id: workspaceId,
        user_id: hungUserId,
        category: 'fuel',
        amount_vnd: 1250000,
        occurred_on: '2026-10-30',
        read_by: 'cheap_pair',
      },
    ]);
  });

  it('saves a category outside the old list', async () => {
    answerPair(harness.readers.cheap, makeReading([makeFuelItem({ category: 'phiếu cân' })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT category FROM records')).toEqual([{ category: 'phiếu cân' }]);
  });

  it('names the printed title of a certificate in the reply', async () => {
    answerPair(harness.readers.cheap, makeReading([makeInspectionCertificate()]));

    await harness.receivePhoto('zu-hung');
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([
      ['zu-hung', `Đã lưu: ${INSPECTION_TITLE}, xe 29C12345.`],
    ]);
  });

  it('stores the printed title of a certificate', async () => {
    answerPair(harness.readers.cheap, makeReading([makeInspectionCertificate()]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT category, document_title FROM records')).toEqual([
      { category: 'kiểm định xe', document_title: INSPECTION_TITLE },
    ]);
  });

  it('replies to one saved item with what was saved', async () => {
    answerPair(harness.readers.cheap, makeReading([makeFuelItem()]));

    await harness.receivePhoto('zu-hung');
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([['zu-hung', 'Đã lưu: Đổ xăng dầu, số 0001234, 1.250.000đ, ngày 30/10/2026.']]);
  });

  it('marks a saved message as accepted', async () => {
    answerPair(harness.readers.cheap, makeReading([makeFuelItem()]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query(`SELECT submission_status FROM messages WHERE author = 'user'`)).toEqual([
      { submission_status: 'accepted' },
    ]);
  });

  it('saves with its own marker when the strong pair agrees', async () => {
    disagreeOnAmount(harness.readers.cheap);
    answerPair(harness.readers.strong, makeReading([makeFuelItem()]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT read_by FROM records')).toEqual([{ read_by: 'expensive_pair' }]);
  });

  function disagreeOnAmount(pair: readonly [FakeReader, FakeReader]): void {
    pair[0].answerWith(makeReading([makeFuelItem()]));
    pair[1].answerWith(makeReading([makeItem({ ...makeFuelItem(), amount_vnd: 1250001 })]));
  }

  it('saves nothing when both pairs disagree', async () => {
    disagreeOnAmount(harness.readers.cheap);
    disagreeOnAmount(harness.readers.strong);

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT 1 FROM records')).toEqual([]);
  });

  it('asks the sender to send again when both pairs disagree', async () => {
    disagreeOnAmount(harness.readers.cheap);
    disagreeOnAmount(harness.readers.strong);

    await harness.receivePhoto('zu-hung');
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([
      [
        'zu-hung',
        'Tôi đọc ảnh này chưa chắc chắn nên chưa lưu. Bạn chụp lại gần hơn, đủ sáng, hoặc nhắn rõ nội dung, ví dụ: "Thay dầu máy 850.000đ ngày 30/10".',
      ],
    ]);
  });

  it('marks an unresolved message as unresolved', async () => {
    disagreeOnAmount(harness.readers.cheap);
    disagreeOnAmount(harness.readers.strong);

    await harness.receivePhoto('zu-hung');

    expect(await database.query(`SELECT submission_status FROM messages WHERE author = 'user'`)).toEqual([
      { submission_status: 'unresolved' },
    ]);
  });

  it('replies to two saved items with one line for each', async () => {
    const toll = (documentNumber: string, amount: number) =>
      makeItem({ category: 'toll', document_number: documentNumber, amount_vnd: amount, occurred_on: '2026-10-30' });
    answerPair(harness.readers.cheap, makeReading([toll('0012345', 35000), toll('0012346', 40000)]));

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
    answerPair(harness.readers.cheap, makeReading([makeFuelItem()]));

    await harness.receivePhoto('zu-hung');
    await harness.sendQueuedTexts();
    await harness.sendQueuedTexts();

    expect(await database.query('SELECT external_user_id FROM outbound_messages')).toEqual([
      { external_user_id: 'zu-hung' },
    ]);
    expect(harness.channel.texts.filter((sent) => sent.to.externalUserId === 'zu-lan')).toEqual([]);
  });

  it('sends a text to the readers as text without an image', async () => {
    await harness.receiveText('zu-hung', 'Đổ dầu 500.000đ');

    expect(harness.readers.cheap.map((reader) => reader.requests.map(({ text, image }) => ({ text, image })))).toEqual([
      [{ text: 'Đổ dầu 500.000đ', image: null }],
      [{ text: 'Đổ dầu 500.000đ', image: null }],
    ]);
  });

  it('sends a photo to the readers with its caption', async () => {
    await harness.receivePhoto('zu-hung', 'Xe 29C-123.45');

    expect(
      harness.readers.cheap.map((reader) => reader.requests.map(({ text, image }) => [text, image?.contentType])),
    ).toEqual([[['Xe 29C-123.45', 'image/jpeg']], [['Xe 29C-123.45', 'image/jpeg']]]);
  });

  function makeQuestionOnly(): Reading {
    return makeReading([], { has_work_data: false, has_question: true });
  }

  it('answers the question of a member with the upload-only reply', async () => {
    answerPair(harness.readers.cheap, makeQuestionOnly());

    await harness.receiveText('zu-hung', 'Hôm qua tôi gửi gì?');
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([
      [
        'zu-hung',
        'Trợ lý chỉ nhận ảnh và thông tin công việc. Bạn gửi ảnh hóa đơn, phiếu giao nhận hoặc giấy tờ bảo dưỡng để lưu nhé.',
      ],
    ]);
  });

  it('saves no record for the question of a member', async () => {
    answerPair(harness.readers.cheap, makeQuestionOnly());

    await harness.receiveText('zu-hung', 'Hôm qua tôi gửi gì?');

    expect(await database.query('SELECT 1 FROM records')).toEqual([]);
  });

  it('saves the data of a member who also asks a question', async () => {
    answerPair(harness.readers.cheap, makeReading([makeFuelItem()], { has_question: true }));

    await harness.receivePhoto('zu-hung', 'Lưu giúp tôi, còn bao nhiêu tiền?');

    expect(await database.query('SELECT 1 FROM records')).toHaveLength(1);
  });

  it('sends only the saved reply to a member who also asks a question', async () => {
    answerPair(harness.readers.cheap, makeReading([makeFuelItem()], { has_question: true }));

    await harness.receivePhoto('zu-hung', 'Lưu giúp tôi, còn bao nhiêu tiền?');
    await harness.sendQueuedTexts();
    await harness.sendQueuedTexts();

    expect(harness.channel.texts).toHaveLength(1);
    expect(harness.channel.texts[0]?.text).toMatch(/^Đã lưu: Đổ xăng dầu/);
  });

  it('stores the identifiers normalized', async () => {
    answerPair(harness.readers.cheap, makeReading([makeItem({ identifiers: ['DT2024-889'] })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT identifiers FROM records')).toEqual([{ identifiers: ['DT2024889'] }]);
  });

  it('stores the plate normalized', async () => {
    answerPair(harness.readers.cheap, makeReading([makeItem({ vehicle_plate: '29C-123.45' })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT vehicle_plate FROM records')).toEqual([{ vehicle_plate: '29C12345' }]);
  });

  it('stores the document number normalized', async () => {
    answerPair(harness.readers.cheap, makeReading([makeItem({ document_number: 'aa/26e-0001234' })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT document_number FROM records')).toEqual([{ document_number: 'AA26E0001234' }]);
  });

  it('stores the maintenance item trimmed and lowercased', async () => {
    const oilChange = makeItem({ category: 'maintenance', maintenance_item: ' Dầu  Máy ', vehicle_plate: '29C-123.45' });
    answerPair(harness.readers.cheap, makeReading([oilChange]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT maintenance_item FROM records')).toEqual([{ maintenance_item: 'dầu máy' }]);
  });

  function makePlatelessMaintenanceItem() {
    return makeItem({ category: 'maintenance', maintenance_item: 'dầu máy', vehicle_plate: null });
  }

  it('saves nothing for a maintenance item without a plate', async () => {
    answerPair(harness.readers.cheap, makeReading([makePlatelessMaintenanceItem()]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT 1 FROM records')).toEqual([]);
  });

  it('asks for the plate when a maintenance item has none', async () => {
    answerPair(harness.readers.cheap, makeReading([makePlatelessMaintenanceItem()]));

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
    answerPair(harness.readers.cheap, makeReading([makeFuelItem(), makePlatelessMaintenanceItem()]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT 1 FROM records')).toEqual([]);
    expect(await database.query('SELECT status FROM inbound_events')).toEqual([{ status: 'done' }]);
  });

  it('marks a maintenance message without a plate as unresolved', async () => {
    answerPair(harness.readers.cheap, makeReading([makePlatelessMaintenanceItem()]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query(`SELECT submission_status FROM messages WHERE author = 'user'`)).toEqual([
      { submission_status: 'unresolved' },
    ]);
  });

  it('saves a fuel item without a plate', async () => {
    answerPair(harness.readers.cheap, makeReading([makeItem({ category: 'fuel', vehicle_plate: null })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT vehicle_plate FROM records')).toEqual([{ vehicle_plate: null }]);
  });

  it('saves only the details both readers returned', async () => {
    const [first, second] = harness.readers.cheap;
    first.answerWith(
      makeReading([
        makeItem({
          details: [
            { label: 'Tên trạm', value: 'Petrolimex Long Biên' },
            { label: 'Số lít', value: '50' },
          ],
        }),
      ]),
    );
    second.answerWith(makeReading([makeItem({ details: [{ label: 'tên trạm', value: 'PETROLIMEX LONG BIEN' }] })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT details FROM records')).toEqual([
      { details: [{ label: 'Tên trạm', value: 'Petrolimex Long Biên' }] },
    ]);
  });

  it('copies the display name of the sender onto the record', async () => {
    answerPair(harness.readers.cheap, makeReading([makeFuelItem()]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT sender_name FROM records')).toEqual([{ sender_name: 'Hùng' }]);
  });

  it('builds the summary from the agreed fields', async () => {
    const tyre = makeItem({
      category: 'maintenance',
      maintenance_item: 'lốp',
      vehicle_plate: '29C-123.45',
      identifiers: ['DT2024-889'],
      document_number: null,
    });
    answerPair(harness.readers.cheap, makeReading([tyre]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT summary FROM records')).toEqual([
      { summary: 'Bảo dưỡng: lốp, xe 29C12345, mã DT2024889' },
    ]);
  });

  async function processSavedPhotoAgain(): Promise<void> {
    answerPair(harness.readers.cheap, makeReading([makeFuelItem()]));
    await harness.receivePhoto('zu-hung');
    const expiredLock = new Date(NOW.getTime() - 60_000).toISOString();
    await database.query(`UPDATE inbound_events SET status = 'processing', locked_until = '${expiredLock}'`);
    harness.readers.cheap.forEach((reader) => reader.requests.splice(0));
    await harness.runInbound();
  }

  it('sends no second reply when a saved message is processed again', async () => {
    await processSavedPhotoAgain();

    expect(await database.query(`SELECT 1 FROM messages WHERE author = 'bot'`)).toHaveLength(1);
    expect(await database.query('SELECT 1 FROM outbound_messages')).toHaveLength(1);
  });

  it('does not read the photo again when a saved message is processed again', async () => {
    await processSavedPhotoAgain();

    expect(harness.readers.cheap.map((reader) => reader.requests.length)).toEqual([0, 0]);
    expect(harness.readers.strong.map((reader) => reader.requests.length)).toEqual([0, 0]);
  });

  it('saves nothing more when a saved message is processed again', async () => {
    await processSavedPhotoAgain();

    expect(await database.query('SELECT 1 FROM records')).toHaveLength(1);
    expect(await database.query('SELECT status FROM inbound_events')).toEqual([{ status: 'done' }]);
  });

  it('saves nothing when the worker lost its claim while the readers read', async () => {
    answerPair(harness.readers.cheap, makeReading([makeFuelItem()]));
    const [reader] = harness.readers.cheap;
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

  it('keeps a message waiting while the readers are not configured', async () => {
    await insertInboundEvent(database, { externalUserId: 'zu-hung', text: 'Đổ dầu 500.000đ' });

    await harness.runInbound({ readers: null });

    expect(await database.query('SELECT status, attempts FROM inbound_events')).toEqual([
      { status: 'queued', attempts: 0 },
    ]);
    expect(await database.query('SELECT 1 FROM outbound_messages')).toEqual([]);
  });

  it('asks the sender to send again when a maintenance item has no name', async () => {
    const unnamed = makeItem({ category: 'maintenance', maintenance_item: '  ', vehicle_plate: '29C-123.45' });
    answerPair(harness.readers.cheap, makeReading([makeFuelItem(), unnamed]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT 1 FROM records')).toEqual([]);
    expect(await database.query('SELECT status FROM inbound_events')).toEqual([{ status: 'done' }]);
    expect(await database.query(`SELECT submission_status FROM messages WHERE author = 'user'`)).toEqual([
      { submission_status: 'unresolved' },
    ]);
  });

  it('drops a maintenance item that an agreed non-maintenance item carries', async () => {
    answerPair(harness.readers.cheap, makeReading([makeItem({ category: 'fuel', maintenance_item: 'dầu máy' })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT maintenance_item FROM records')).toEqual([{ maintenance_item: null }]);
  });

  it('gives the upload-only reply when work data has no item', async () => {
    answerPair(harness.readers.cheap, makeReading([], { has_work_data: true }));

    await harness.receiveText('zu-hung', 'Đổ dầu');
    await harness.sendQueuedTexts();

    expect(harness.channel.texts.map((sent) => sent.text)).toEqual([
      'Trợ lý chỉ nhận ảnh và thông tin công việc. Bạn gửi ảnh hóa đơn, phiếu giao nhận hoặc giấy tờ bảo dưỡng để lưu nhé.',
    ]);
    expect(await database.query('SELECT 1 FROM records')).toEqual([]);
  });

  it('does not read a text again when it is processed again', async () => {
    await harness.receiveText('zu-hung', 'Đổ dầu 500.000đ');
    const expiredLock = new Date(NOW.getTime() - 60_000).toISOString();
    await database.query(`UPDATE inbound_events SET status = 'processing', locked_until = '${expiredLock}'`);

    await harness.runInbound();

    expect(harness.readers.cheap.map((reader) => reader.requests.length)).toEqual([1, 1]);
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

  function makeFuelItem(overrides: Partial<ReadingItem> = {}) {
    return makeItem({
      category: 'fuel',
      amount_vnd: 1250000,
      occurred_on: '2026-10-30',
      document_number: '0001234',
      ...overrides,
    });
  }

  function sentTexts(): string[][] {
    return harness.channel.texts.map((sent) => [sent.to.externalUserId, sent.text]);
  }

  function answerPair(pair: readonly [FakeReader, FakeReader], reading: Reading): void {
    pair.forEach((reader) => reader.answerWith(reading));
  }
});
