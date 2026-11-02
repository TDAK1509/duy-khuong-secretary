import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Reading } from '../../src/app/reading/reading.ts';
import type { FakeReader } from '../fakes/fake-reader.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

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

  function makeFuelItem() {
    return makeItem({ category: 'fuel', amount_vnd: 1250000, occurred_on: '2026-10-30', document_number: '0001234' });
  }

  function sentTexts(): string[][] {
    return harness.channel.texts.map((sent) => [sent.to.externalUserId, sent.text]);
  }

  function answerPair(pair: readonly [FakeReader, FakeReader], reading: Reading): void {
    pair.forEach((reader) => reader.answerWith(reading));
  }
});
