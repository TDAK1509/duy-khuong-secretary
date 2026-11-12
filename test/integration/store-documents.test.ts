import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DUPLICATE_TEXT } from '../../src/app/intake/intake-texts.ts';
import { buildMatchKey } from '../../src/app/documents/build-match-key.ts';
import { makeItem, makeReading, type ItemOverrides } from '../unit/reading/make-reading.ts';
import { insertDocumentWithSource, insertOrganizationWithAlias } from './document-rows.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

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

  function insertChengLoong(): Promise<string> {
    return insertOrganizationWithAlias(database, { workspaceId: harness.workspaceId, name: 'Cheng Loong' });
  }

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

  it('stores a party shared by both jobs of one maintenance invoice once', async () => {
    const issuer = [makeParty('issuer', 'Gara Hòa Phát')];
    const makeJob = (job: string) =>
      makeTicketItem({ category: 'bảo dưỡng', maintenance_item: job, vehicle_plate: '93C04588', parties: issuer });
    harness.reader.answerWith(makeReading([makeJob('dầu máy'), makeJob('lốp')]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT role, printed_name FROM document_parties')).toEqual([
      { role: 'issuer', printed_name: 'Gara Hòa Phát' },
    ]);
  });

  it('adds only a source when the same ticket is sent again with the same plate', async () => {
    await insertDocumentWithSource(database, {
      workspaceId: harness.workspaceId,
      userId: harness.hungUserId,
      issuerKey: PORT_ISSUER_KEY,
      documentNumber: 'CAU',
      documentDate: '2026-11-05',
      vehiclePlate: '93C04588',
    });
    harness.reader.answerWith(makeReading([makePortTicket('93C04588')]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT count(*)::int AS count FROM documents')).toEqual([{ count: 1 }]);
    expect(await database.query('SELECT count(*)::int AS count FROM document_sources')).toEqual([{ count: 2 }]);
  });

  it('links the source of a photo that is answered as a duplicate', async () => {
    harness.reader.answerWith(makeReading([makeChengLoongTicket('93C04588')]));
    await harness.receivePhoto('zu-hung');
    await harness.sendQueuedTexts();
    harness.channel.texts.splice(0);

    await harness.receivePhoto('zu-hung');
    await harness.sendQueuedTexts();

    expect(harness.channel.texts.map((sent) => sent.text)).toEqual([DUPLICATE_TEXT]);
    expect(await database.query('SELECT count(*)::int AS count FROM records')).toEqual([{ count: 1 }]);
    expect(await database.query('SELECT count(*)::int AS count FROM documents')).toEqual([{ count: 1 }]);
    expect(await database.query('SELECT count(DISTINCT message_id)::int AS count FROM document_sources')).toEqual([{ count: 2 }]);
  });

  it('keeps one document when a photo of a sheet without a number is sent again', async () => {
    harness.reader.answerWith(makeReading([makeTicketItem({ document_number: null })]));
    await harness.receivePhoto('zu-hung');
    await harness.sendQueuedTexts();
    harness.channel.texts.splice(0);

    await harness.receivePhoto('zu-hung');
    await harness.sendQueuedTexts();

    expect(harness.channel.texts.map((sent) => sent.text)).toEqual([DUPLICATE_TEXT]);
    expect(await database.query('SELECT count(*)::int AS count FROM documents')).toEqual([{ count: 1 }]);
  });

  it('saves the record and the document of an item with a blank line item, a blank label and a padded kind', async () => {
    const details = [
      { label: 'Hàng hóa', value: 'Giấy phế liệu', item: '  ' },
      { label: '  ', value: 'không nhãn' },
    ];
    harness.reader.answerWith(makeReading([makeTicketItem({ details, document_kind: ' phiếu cân xe ' })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT count(*)::int AS count FROM records')).toEqual([{ count: 1 }]);
    expect(await database.query('SELECT kind FROM documents')).toEqual([{ kind: 'phiếu cân xe' }]);
    expect(await database.query('SELECT line_no, label, item FROM document_lines')).toEqual([
      { line_no: 0, label: 'Hàng hóa', item: null },
    ]);
  });

  it('stores a different plate on the same ticket number and date as its own accepted document', async () => {
    await insertDocumentWithSource(database, {
      workspaceId: harness.workspaceId,
      userId: harness.hungUserId,
      issuerKey: PORT_ISSUER_KEY,
      documentNumber: 'CAU',
      documentDate: '2026-11-05',
      vehiclePlate: '93C04588',
    });
    harness.reader.answerWith(makeReading([makePortTicket('93C04258')]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT vehicle_plate, status FROM documents ORDER BY vehicle_plate')).toEqual([
      { vehicle_plate: '93C04258', status: 'accepted' },
      { vehicle_plate: '93C04588', status: 'accepted' },
    ]);
  });

  it('links a line to the workspace meaning of its known name', async () => {
    const weight = { label: 'Trọng lượng tịnh', value: '26380 kg', number: 26380, unit: 'kg' as const, meaning: 'trọng lượng hàng' };
    harness.reader.answerWith(makeReading([makeTicketItem({ details: [weight] })]));

    await harness.receivePhoto('zu-hung');

    expect(
      await database.query(
        `SELECT meaning.name, meaning.value_type, line.number::int AS number, line.unit
         FROM document_lines line JOIN meanings meaning ON meaning.id = line.meaning_id`,
      ),
    ).toEqual([{ name: 'Trọng lượng hàng', value_type: 'number', number: 26380, unit: 'kg' }]);
  });

  it('stores the date and time of a date line and gives its meaning the date type', async () => {
    const weighing = { label: 'Giờ cân lần 1', value: '05/11/2026 13:03:55', meaning: 'Thời điểm cân lần 1', date_time: '2026-11-05T13:03:55' };
    harness.reader.answerWith(makeReading([makeTicketItem({ details: [weighing] })]));

    await harness.receivePhoto('zu-hung');

    expect(
      await database.query(
        `SELECT to_char(line.at, 'YYYY-MM-DD HH24:MI:SS') AS at, meaning.value_type
         FROM document_lines line JOIN meanings meaning ON meaning.id = line.meaning_id`,
      ),
    ).toEqual([{ at: '2026-11-05 13:03:55', value_type: 'date' }]);
  });

  it('links a printed name that equals an alias at once', async () => {
    const organizationId = await insertOrganizationWithAlias(database, {
      workspaceId: harness.workspaceId,
      name: 'Công ty TNHH Cheng Loong Bình Dương Paper',
    });
    const printedInCapitals = makeParty('issuer', 'CÔNG TY TNHH CHENG LOONG BÌNH DƯƠNG PAPER');
    harness.reader.answerWith(makeReading([makeTicketItem({ parties: [printedInCapitals] })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT organization_id FROM document_parties')).toEqual([{ organization_id: organizationId }]);
  });

  it('counts a new spelling of a saved company under it at once', async () => {
    const organizationId = await insertChengLoong();
    harness.reader.answerWith(makeReading([makeTicketItem({ parties: [makeMisreadIssuer()] })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT organization_id FROM document_parties')).toEqual([{ organization_id: organizationId }]);
  });

  it('records the merge once, with the alias of the new spelling', async () => {
    const organizationId = await insertChengLoong();
    harness.reader.answerWith(makeReading([makeTicketItem({ parties: [makeMisreadIssuer()] })]));

    await harness.receivePhoto('zu-hung');

    const matchKey = buildMatchKey(MISREAD_NAME);
    expect(await database.query('SELECT printed_name, match_key, organization_id FROM merged_names')).toEqual([
      { printed_name: MISREAD_NAME, match_key: matchKey, organization_id: organizationId },
    ]);
    expect(await database.query(`SELECT organization_id FROM organization_aliases WHERE match_key = '${matchKey}'`)).toEqual([
      { organization_id: organizationId },
    ]);
  });

  it('adds no merge row for a second paper with the same spelling', async () => {
    const organizationId = await insertChengLoong();
    harness.reader.answerWith(makeReading([makeTicketItem({ parties: [makeMisreadIssuer()] })]));
    await harness.receivePhoto('zu-hung');
    const sameSpelling = makeParty('issuer', MISREAD_NAME);
    harness.reader.answerWith(makeReading([makeTicketItem({ document_number: '20261105099', parties: [sameSpelling] })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT organization_id FROM document_parties')).toEqual([
      { organization_id: organizationId },
      { organization_id: organizationId },
    ]);
    expect(await database.query('SELECT count(*)::int AS count FROM merged_names')).toEqual([{ count: 1 }]);
  });

  it('merges a spelling whose reader name is in capitals without accents', async () => {
    const organizationId = await insertOrganizationWithAlias(database, { workspaceId: harness.workspaceId, name: 'Công ty Kim Nhân Đạo' });
    const capitals = makeParty('issuer', 'C.TY TNHH KIM NHAN DAO', 'CONG TY KIM NHAN DAO');
    harness.reader.answerWith(makeReading([makeTicketItem({ parties: [capitals] })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT organization_id FROM document_parties')).toEqual([{ organization_id: organizationId }]);
  });

  it('stores the name the reader gave next to the printed name', async () => {
    await insertChengLoong();
    harness.reader.answerWith(makeReading([makeTicketItem({ parties: [makeMisreadIssuer()] })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT printed_name, known_name FROM document_parties')).toEqual([
      { printed_name: MISREAD_NAME, known_name: 'Cheng Loong' },
    ]);
  });

  it('stores a blank name from the reader as null', async () => {
    await insertChengLoong();
    harness.reader.answerWith(makeReading([makeTicketItem({ parties: [makeParty('issuer', MISREAD_NAME, '  ')] })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT known_name FROM document_parties')).toEqual([{ known_name: null }]);
  });

  it('creates an organization with an alias for a new name and links the party to it', async () => {
    const customer = makeParty('customer', 'C.Ty CHANH DUONG');
    harness.reader.answerWith(makeReading([makeTicketItem({ parties: [customer] })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT id, name, type FROM organizations')).toEqual([
      { id: expect.any(String), name: 'C.Ty CHANH DUONG', type: 'company' },
    ]);
    expect(
      await database.query(
        `SELECT alias.printed_name, party.role
         FROM organization_aliases alias JOIN document_parties party ON party.organization_id = alias.organization_id`,
      ),
    ).toEqual([{ printed_name: 'C.Ty CHANH DUONG', role: 'customer' }]);
  });

  it('leaves out a party whose name holds no letter or digit', async () => {
    harness.reader.answerWith(makeReading([makeTicketItem({ parties: [makeParty('customer', '...')] })]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT count(*)::int AS count FROM document_parties')).toEqual([{ count: 0 }]);
    expect(await database.query('SELECT count(*)::int AS count FROM documents')).toEqual([{ count: 1 }]);
  });

  it('matches a document that came from the photo of another member', async () => {
    const lanUserId = await insertMember(database, { workspaceId: harness.workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    await insertDocumentWithSource(database, {
      workspaceId: harness.workspaceId,
      userId: lanUserId,
      issuerKey: 'congtytnhhchengloongbinhduongpaper',
      documentNumber: '20261105054',
      documentDate: '2026-11-05',
      vehiclePlate: '93C04588',
    });
    harness.reader.answerWith(makeReading([makeChengLoongTicket('93C04588')]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT count(*)::int AS count FROM documents')).toEqual([{ count: 1 }]);
    const sources = await database.query<{ user_id: string }>(
      `SELECT message.user_id FROM document_sources source JOIN messages message ON message.id = source.message_id`,
    );
    expect(sources).toHaveLength(2);
    expect(sources.map((source) => source.user_id)).toEqual(expect.arrayContaining([lanUserId, harness.hungUserId]));
  });

  it('saves no record when the database refuses the document', async () => {
    const refusedParty = { ...makeParty('customer', 'Nguyễn Văn A'), type: 'person' };
    harness.reader.answerWith(makeReading([makeTicketItem({ parties: [refusedParty] })]));

    await harness.receivePhoto('zu-hung').catch(() => undefined);

    expect(await database.query('SELECT count(*)::int AS count FROM records')).toEqual([{ count: 0 }]);
    expect(await database.query('SELECT count(*)::int AS count FROM documents')).toEqual([{ count: 0 }]);
  });

  it('stores two items of one photo with different plates as two accepted documents', async () => {
    harness.reader.answerWith(makeReading([makePortTicket('93C04588'), makePortTicket('93H00311')]));

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT vehicle_plate, status FROM documents ORDER BY vehicle_plate')).toEqual([
      { vehicle_plate: '93C04588', status: 'accepted' },
      { vehicle_plate: '93H00311', status: 'accepted' },
    ]);
  });

  it('keeps the meaning of a line whose number cannot be read', async () => {
    const unreadable = { label: 'TL tịnh', value: '2?.950', meaning: 'Trọng lượng hàng' };
    harness.reader.answerWith(makeReading([makeTicketItem({ details: [unreadable] })]));

    await harness.receivePhoto('zu-hung');

    expect(
      await database.query(
        `SELECT meaning.name, line.number FROM document_lines line JOIN meanings meaning ON meaning.id = line.meaning_id`,
      ),
    ).toEqual([{ name: 'Trọng lượng hàng', number: null }]);
  });

  it('stores the document of a photo saved after the explanation text, with the photo as its source', async () => {
    harness.reader.answerWith(makeReading([], { has_work_data: false, needs_explanation: true }));
    await harness.receivePhoto('zu-hung');
    harness.reader.answerWith(makeReading([makeChengLoongTicket('93C04588')]));

    await harness.receiveText('zu-hung', 'Phiếu cân xe 93C04588');

    expect(
      await database.query(
        `SELECT document.document_number, message.image_key IS NOT NULL AS is_photo
         FROM documents document
           JOIN document_sources source ON source.document_id = document.id
           JOIN messages message ON message.id = source.message_id`,
      ),
    ).toEqual([{ document_number: '20261105054', is_photo: true }]);
  });
});

const MISREAD_NAME = 'Công ty TNHH Chống Loong Bình Dương Paper';
const PORT_ISSUER_KEY = 'congtycpcangvanangluongbinhduong';

function makePortTicket(vehiclePlate: string | null) {
  return makeTicketItem({
    document_number: 'CAU',
    vehicle_plate: vehiclePlate,
    parties: [makeParty('issuer', 'Công ty CP Cảng và Năng lượng Bình Dương')],
  });
}

function makeChengLoongTicket(vehiclePlate: string | null) {
  return makeTicketItem({
    document_number: '20261105054',
    vehicle_plate: vehiclePlate,
    parties: [makeParty('issuer', 'Công ty TNHH Cheng Loong Bình Dương Paper')],
  });
}

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

function makeMisreadIssuer() {
  return makeParty('issuer', MISREAD_NAME, 'Cheng Loong');
}

function makeParty(role: string, printedName: string, knownName: string | null = null) {
  return { role, type: 'company', printed_name: printedName, known_name: knownName };
}
