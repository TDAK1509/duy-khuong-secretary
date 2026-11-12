import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildMatchKey } from '../../src/app/documents/build-match-key.ts';
import { NO_PENDING_CHOICE_TEXT } from '../../src/app/processing/conversation-texts.ts';
import { makeItem, makeReading, type ItemOverrides } from '../unit/reading/make-reading.ts';
import { insertOrganizationWithAlias } from './document-rows.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import { literal } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const ADMINS_LAST_WROTE_AT = new Date('2026-11-01T10:00:00+07:00');
const CHENG_LOONG = 'Cheng Loong';
const CHONG_LOONG = 'Công ty TNHH Chống Loong Bình Dương Paper';

describe('merging a close name when the paper is read', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let chengLoongId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database } = harness);
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    await insertAdmin('zu-duy', 'Duy');
    await insertAdmin('zu-khuong', 'Khương');
    chengLoongId = await insertOrganizationWithAlias(database, { workspaceId: harness.workspaceId, name: CHENG_LOONG });
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

  it('sends no admin the proposal after a photo explanation', async () => {
    harness.reader.answerWith(makeReading([], { has_work_data: false, needs_explanation: true }));
    await harness.receivePhoto('zu-hung');
    harness.reader.answerWith(makeReading([makeTicketItem({ parties: [makeMisreadIssuer()] })]));

    await harness.receiveText('zu-hung', 'Phiếu cân xe 93C04588');

    expect(await readProposalsQueued()).toEqual([]);
  });

  it('treats a number from an admin as no choice when an old name choice is stored', async () => {
    const pair = { match_key: buildMatchKey(CHONG_LOONG), organization_id: chengLoongId, printed_name: CHONG_LOONG };
    const choice = { kind: 'name_match', workspace_id: harness.workspaceId, pairs: [pair] };
    await database.query(`UPDATE channel_identities SET pending_choice = ${literal(JSON.stringify(choice))}::jsonb WHERE external_user_id = 'zu-duy'`);

    await harness.receiveText('zu-duy', '1');
    await harness.sendAllQueuedTexts();

    expect(harness.channel.sends).toEqual([{ kind: 'text', to: 'zu-duy', text: NO_PENDING_CHOICE_TEXT }]);
    expect(await database.query('SELECT count(*)::int AS count FROM organization_aliases')).toEqual([{ count: 1 }]);
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
