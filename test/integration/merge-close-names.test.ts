import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeItem, makeReading, type ItemOverrides } from '../unit/reading/make-reading.ts';
import { insertOrganizationWithAlias } from './document-rows.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const ADMINS_LAST_WROTE_AT = new Date('2026-11-01T10:00:00+07:00');
const CHENG_LOONG = 'Cheng Loong';
const CHONG_LOONG = 'Công ty TNHH Chống Loong Bình Dương Paper';

describe('merging a close name when the paper is read', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database } = harness);
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    await insertAdmin('zu-duy', 'Duy');
    await insertAdmin('zu-khuong', 'Khương');
    await insertOrganizationWithAlias(database, { workspaceId: harness.workspaceId, name: CHENG_LOONG });
  });

  afterEach(async () => {
    await harness.close();
  });

  function insertAdmin(externalUserId: string, displayName: string): Promise<string> {
    return insertMember(database, { workspaceId: harness.workspaceId, externalUserId, displayName, role: 'admin', lastInboundAt: ADMINS_LAST_WROTE_AT });
  }

  function readProposalsQueued() {
    return database.query(`SELECT external_user_id, body FROM outbound_messages WHERE body LIKE 'Tên mới đọc được gần giống tên đã lưu:%'`);
  }

  it('sends no admin the proposal after a photo', async () => {
    harness.reader.answerWith(makeReading([makeTicketItem({ parties: [makeMisreadIssuer()] })]));

    await harness.receivePhoto('zu-hung');

    expect(await readProposalsQueued()).toEqual([]);
  });
});

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
