import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeItem, makeReading, type ItemOverrides } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

describe('storing the documents of a saved message', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database } = harness);
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('stores one document with the source message and item of a saved item', async () => {
    harness.reader.answerWith(makeReading([makeTicketItem({ parties: [makeParty('issuer', 'CTY THUẬN MINH')] })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT document_number, issuer_key FROM documents')).toEqual([
      { document_number: '20261105062', issuer_key: 'ctythuanminh' },
    ]);
    expect(
      await database.query(
        `SELECT source.item_index, message.user_id
         FROM document_sources source JOIN messages message ON message.id = source.message_id`,
      ),
    ).toEqual([{ item_index: 0, user_id: harness.hungUserId }]);
  });

  it('makes one document with two sources of two identical items on one sheet', async () => {
    const copy = makeTicketItem({
      document_number: '20261105054',
      parties: [makeParty('issuer', 'Công ty TNHH Cheng Loong Bình Dương Paper')],
      details: [{ label: 'Hàng hóa', value: 'Giấy phế liệu' }],
    });
    harness.reader.answerWith(makeReading([copy, copy]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT document_number FROM documents')).toEqual([{ document_number: '20261105054' }]);
    expect(await database.query('SELECT item_index FROM document_sources ORDER BY item_index')).toEqual([
      { item_index: 0 },
      { item_index: 1 },
    ]);
    expect(await database.query('SELECT line_no, label, value FROM document_lines')).toEqual([
      { line_no: 0, label: 'Hàng hóa', value: 'Giấy phế liệu' },
    ]);
  });

  it('makes one document with the lines of both jobs of one maintenance invoice', async () => {
    const issuer = [makeParty('issuer', 'Gara Hòa Phát')];
    const makeJob = (job: string) =>
      makeTicketItem({
        category: 'bảo dưỡng',
        maintenance_item: job,
        vehicle_plate: '93C04588',
        parties: issuer,
        details: [{ label: 'Thành tiền', value: '1.000.000', item: job, meaning: 'Thành tiền' }],
      });
    harness.reader.answerWith(makeReading([makeJob('dầu máy'), makeJob('lốp')]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT count(*)::int AS count FROM documents')).toEqual([{ count: 1 }]);
    expect(await database.query(`SELECT item FROM document_lines WHERE label = 'Thành tiền' ORDER BY line_no`)).toEqual([
      { item: 'dầu máy' },
      { item: 'lốp' },
    ]);
  });
});

function makeTicketItem(overrides: ItemOverrides = {}) {
  return makeItem({
    category: 'phiếu cân',
    amount_vnd: null,
    occurred_on: '2026-11-05',
    document_number: '20261105062',
    document_kind: 'phiếu cân xe',
    ...overrides,
  });
}

function makeParty(role: string, printedName: string, knownName: string | null = null) {
  return { role, type: 'company', printed_name: printedName, known_name: knownName };
}
