import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildMatchKey } from '../../src/app/documents/build-match-key.ts';
import { makeItem, makeReading, type ItemOverrides } from '../unit/reading/make-reading.ts';
import { insertOrganizationWithAlias } from './document-rows.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import { literal } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const CHENG_LOONG = 'Công ty TNHH Cheng Loong Bình Dương Paper';
const ADMIN_LAST_WROTE_AT = new Date('2026-11-01T10:00:00+07:00');
const CHONG_LOONG = 'Công ty TNHH Chống Loong Bình Dương Paper';

describe('the number reply of an admin to the name proposal', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let chengLoongId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database } = harness);
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    await insertMember(database, { workspaceId: harness.workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin', lastInboundAt: ADMIN_LAST_WROTE_AT });
    chengLoongId = await insertOrganizationWithAlias(database, { workspaceId: harness.workspaceId, name: CHENG_LOONG });
  });

  afterEach(async () => {
    await harness.close();
  });

  async function waitForMisreadParty(): Promise<void> {
    harness.reader.answerWith(makeReading([makeTicketItem({ parties: [makeParty('issuer', CHONG_LOONG, CHENG_LOONG)] })]));
    await harness.receivePhoto('zu-hung');
  }

  function holdProposalChoice(externalUserId: string, pairs: { printedName: string; organizationId: string }[]): Promise<unknown> {
    const choice = {
      kind: 'name_match',
      workspace_id: harness.workspaceId,
      pairs: pairs.map((pair) => ({
        match_key: buildMatchKey(pair.printedName),
        organization_id: pair.organizationId,
        printed_name: pair.printedName,
      })),
    };
    return database.query(
      `UPDATE channel_identities SET pending_choice = ${literal(JSON.stringify(choice))}::jsonb WHERE external_user_id = ${literal(externalUserId)}`,
    );
  }

  it('links the waiting party to the proposed organization, clears its proposal and confirms it', async () => {
    await waitForMisreadParty();
    await harness.sendAllQueuedTexts();
    harness.channel.sends.splice(0);
    await holdProposalChoice('zu-duy', [{ printedName: CHONG_LOONG, organizationId: chengLoongId }]);

    await harness.receiveText('zu-duy', '1');
    await harness.sendAllQueuedTexts();

    expect(await database.query('SELECT organization_id, proposed_organization_id FROM document_parties')).toEqual([
      { organization_id: chengLoongId, proposed_organization_id: null },
    ]);
    expect(harness.channel.sends).toEqual([
      { kind: 'text', to: 'zu-duy', text: `Đã xác nhận "${CHONG_LOONG}" là "${CHENG_LOONG}" (1 giấy tờ).` },
    ]);
  });

  it('links the next document with a confirmed spelling to the organization at once', async () => {
    await waitForMisreadParty();
    await holdProposalChoice('zu-duy', [{ printedName: CHONG_LOONG, organizationId: chengLoongId }]);
    await harness.receiveText('zu-duy', '1');
    harness.reader.answerWith(
      makeReading([makeTicketItem({ document_number: '20261105099', parties: [makeParty('issuer', CHONG_LOONG, CHENG_LOONG)] })]),
    );

    await harness.receivePhoto('zu-hung');

    expect(await database.query('SELECT organization_id, proposed_organization_id FROM document_parties ORDER BY created_at')).toEqual([
      { organization_id: chengLoongId, proposed_organization_id: null },
      { organization_id: chengLoongId, proposed_organization_id: null },
    ]);
  });

  it('keeps the listed names apart as new organizations of the stored type when the admin replies 0', async () => {
    const placeId = await insertOrganizationWithAlias(database, { workspaceId: harness.workspaceId, name: 'Kho than Phú Mỹ', type: 'place' });
    const printedPlace = { role: 'place', type: 'place', printed_name: 'KHO THAN CẢNG PHÚ MỸ', known_name: 'Kho than Phú Mỹ' };
    harness.reader.answerWith(makeReading([makeTicketItem({ parties: [printedPlace] })]));
    await harness.receivePhoto('zu-hung');
    await harness.sendAllQueuedTexts();
    harness.channel.sends.splice(0);
    await holdProposalChoice('zu-duy', [{ printedName: 'KHO THAN CẢNG PHÚ MỸ', organizationId: placeId }]);

    await harness.receiveText('zu-duy', '0');
    await harness.sendAllQueuedTexts();

    const created = await database.query<{ id: string }>(
      `SELECT id FROM organizations WHERE name = 'KHO THAN CẢNG PHÚ MỸ' AND type = 'place'`,
    );
    expect(created).toHaveLength(1);
    expect(await database.query('SELECT organization_id, proposed_organization_id FROM document_parties')).toEqual([
      { organization_id: created[0]?.id, proposed_organization_id: null },
    ]);
    expect(harness.channel.sends).toEqual([{ kind: 'text', to: 'zu-duy', text: 'Đã lưu các tên này là bên riêng.' }]);
  });
});

function makeParty(role: string, printedName: string, knownName: string | null = null) {
  return { role, type: 'company', printed_name: printedName, known_name: knownName };
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
