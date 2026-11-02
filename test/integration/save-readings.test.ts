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
