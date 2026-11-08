import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeItem, makeReading, type ItemOverrides } from '../unit/reading/make-reading.ts';
import { insertOrganizationWithAlias } from './document-rows.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const CHENG_LOONG = 'Công ty TNHH Cheng Loong Bình Dương Paper';
const CHONG_LOONG = 'Công ty TNHH Chống Loong Bình Dương Paper';
const PROPOSAL_TEXT = [
  'Tên mới đọc được gần giống tên đã lưu:',
  `1. "${CHONG_LOONG}" → "${CHENG_LOONG}" (1 giấy tờ)`,
  'Trả lời số để xác nhận là cùng một bên. Trả lời 0 nếu không có cặp nào đúng. Khi chưa xác nhận, các giấy tờ này chưa được tính theo tên đó.',
].join('\n');

describe('the proposal of names spelled close to a known company', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database } = harness);
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    await insertAdmin('zu-duy', 'Duy');
    await insertAdmin('zu-khuong', 'Khương');
  });

  afterEach(async () => {
    await harness.close();
  });

  function insertAdmin(externalUserId: string, displayName: string): Promise<string> {
    return insertMember(database, { workspaceId: harness.workspaceId, externalUserId, displayName, role: 'admin' });
  }

  function readProposalsQueued() {
    return database.query<{ external_user_id: string; body: string }>(
      `SELECT external_user_id, body FROM outbound_messages WHERE body LIKE 'Tên mới đọc được%' ORDER BY external_user_id`,
    );
  }

  it('queues the proposal to each admin after a save with a proposed party', async () => {
    await insertOrganizationWithAlias(database, { workspaceId: harness.workspaceId, name: CHENG_LOONG });
    harness.reader.answerWith(makeReading([makeTicketItem({ parties: [makeMisreadIssuer()] })]));

    await harness.receivePhoto('zu-hung');

    expect(await readProposalsQueued()).toEqual([
      { external_user_id: 'zu-duy', body: PROPOSAL_TEXT },
      { external_user_id: 'zu-khuong', body: PROPOSAL_TEXT },
    ]);
  });

  it('queues no new proposal after a save whose names are all new, while an earlier pair still waits', async () => {
    await insertOrganizationWithAlias(database, { workspaceId: harness.workspaceId, name: CHENG_LOONG });
    harness.reader.answerWith(makeReading([makeTicketItem({ parties: [makeMisreadIssuer()] })]));
    await harness.receivePhoto('zu-hung');
    const proposalsBefore = await readProposalsQueued();
    harness.reader.answerWith(makeReading([makeTicketItem({ document_number: '20261105099', parties: [makeNewIssuer()] })]));

    await harness.receivePhoto('zu-hung');

    expect(await readProposalsQueued()).toEqual(proposalsBefore);
  });
});

function makeNewIssuer() {
  return { role: 'issuer', type: 'company', printed_name: 'Công ty Mới Hoàn Toàn', known_name: null };
}

function makeMisreadIssuer() {
  return { role: 'issuer', type: 'company', printed_name: CHONG_LOONG, known_name: CHENG_LOONG };
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
