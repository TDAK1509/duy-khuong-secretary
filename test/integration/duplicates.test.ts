import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Reading, ReadingItem } from '../../src/app/reading/reading.ts';
import type { FakeReader } from '../fakes/fake-reader.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import { holdReaderUntilArrivals } from './reader-barrier.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('rejecting duplicate papers', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId } = harness);
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('does not save the copy of a saved paper that another driver sends', async () => {
    answerPair(harness.readers.cheap, makeReading([makeFuelItem()]));
    await harness.receivePhoto('zu-hung');

    await harness.receivePhoto('zu-lan');

    expect(await database.query('SELECT 1 FROM records')).toHaveLength(1);
  });

  it('tells the driver of a copy that the group already has the paper', async () => {
    answerPair(harness.readers.cheap, makeReading([makeFuelItem()]));
    await harness.receivePhoto('zu-hung');
    await harness.sendQueuedTexts();
    harness.channel.texts.splice(0);

    await harness.receivePhoto('zu-lan');
    await harness.sendQueuedTexts();

    expect(harness.channel.texts.map((sent) => [sent.to.externalUserId, sent.text])).toEqual([
      [
        'zu-lan',
        'Ảnh hoặc chứng từ này đã có trong nhóm. Tôi chưa lưu bản trùng. Bạn kiểm tra lại nhé.',
      ],
    ]);
  });

  it('marks the message of a duplicate as duplicate', async () => {
    answerPair(harness.readers.cheap, makeReading([makeFuelItem()]));
    await harness.receivePhoto('zu-hung');

    await harness.receivePhoto('zu-lan');

    expect(
      await database.query(
        `SELECT submission_status FROM messages
         WHERE author = 'user' AND user_id <> '${harness.hungUserId}'`,
      ),
    ).toEqual([{ submission_status: 'duplicate' }]);
  });

  it('saves a paper whose printed title differs from the title of a saved paper', async () => {
    answerPair(harness.readers.cheap, makeReading([makeFuelItem({ document_title: 'Hóa đơn bán lẻ xăng dầu' })]));
    await harness.receivePhoto('zu-hung');
    answerPair(harness.readers.cheap, makeReading([makeFuelItem({ document_title: 'Phiếu xuất kho' })]));

    await harness.receivePhoto('zu-lan');

    expect(await database.query('SELECT document_title FROM records ORDER BY created_at')).toEqual([
      { document_title: 'Hóa đơn bán lẻ xăng dầu' },
      { document_title: 'Phiếu xuất kho' },
    ]);
  });

  it('does not save the copy of a saved paper that has the same printed title', async () => {
    answerPair(harness.readers.cheap, makeReading([makeFuelItem({ document_title: 'Hóa đơn bán lẻ xăng dầu' })]));
    await harness.receivePhoto('zu-hung');

    await harness.receivePhoto('zu-lan');

    expect(await database.query('SELECT 1 FROM records')).toHaveLength(1);
  });

  it('saves the same paper in another workspace', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải Thử');
    await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy' });
    answerPair(harness.readers.cheap, makeReading([makeFuelItem()]));
    await harness.receivePhoto('zu-vy');

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT workspace_id FROM records ORDER BY created_at')).toEqual([
      { workspace_id: otherWorkspaceId },
      { workspace_id: workspaceId },
    ]);
  });

  it('rejects the whole message when one of its items is a duplicate', async () => {
    const toll = (documentNumber: string, amount: number) =>
      makeItem({ category: 'toll', document_number: documentNumber, amount_vnd: amount, occurred_on: '2026-10-30' });
    answerPair(harness.readers.cheap, makeReading([toll('0012345', 35000)]));
    await harness.receivePhoto('zu-hung');
    answerPair(harness.readers.cheap, makeReading([toll('0012345', 35000), toll('0012346', 40000)]));

    await harness.receivePhoto('zu-lan');

    expect(await database.query('SELECT 1 FROM records')).toHaveLength(1);
  });

  it('saves a new paper once when two drivers send it at the same moment', async () => {
    await processSamePaperFromHungAndLanTogether();

    expect(await database.query('SELECT 1 FROM records')).toHaveLength(1);
  });

  it('gives the later of two simultaneous copies the duplicate reply', async () => {
    await processSamePaperFromHungAndLanTogether();

    await harness.sendQueuedTexts();
    await harness.sendQueuedTexts();

    const sentTexts = harness.channel.texts.map((sent) => sent.text);
    expect(sentTexts.filter((text) => text.startsWith('Đã lưu:'))).toHaveLength(1);
    expect(sentTexts).toContain('Ảnh hoặc chứng từ này đã có trong nhóm. Tôi chưa lưu bản trùng. Bạn kiểm tra lại nhé.');
  });

  it('finds a saved copy when the connections format dates another way', async () => {
    await formatDatesDayFirstOnNewConnections();
    answerPair(harness.readers.cheap, makeReading([makeFuelItem()]));
    await harness.receivePhoto('zu-hung');

    await harness.receivePhoto('zu-lan');

    expect(await database.query('SELECT 1 FROM records')).toHaveLength(1);
  });

  async function formatDatesDayFirstOnNewConnections(): Promise<void> {
    const databaseName = new URL(database.url).pathname.slice(1);
    await database.query(`ALTER DATABASE ${databaseName} SET DateStyle = 'SQL, DMY'`);
    const idleConnection = await harness.pool.connect();
    idleConnection.release(true);
  }

  async function processSamePaperFromHungAndLanTogether(): Promise<void> {
    answerPair(harness.readers.cheap, makeReading([makeFuelItem()]));
    holdReaderUntilArrivals(harness.readers.cheap[0], 2);
    await insertInboundEvent(database, { externalUserId: 'zu-hung', kind: 'images', imageUrls: [PHOTO_URL] });
    await insertInboundEvent(database, { externalUserId: 'zu-lan', kind: 'images', imageUrls: [PHOTO_URL] });
    await Promise.all([harness.runInbound(), harness.runInbound()]);
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

  function answerPair(pair: readonly [FakeReader, FakeReader], reading: Reading): void {
    pair.forEach((reader) => reader.answerWith(reading));
  }
});
