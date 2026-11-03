import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const DUY_JOINED_AT = new Date('2026-10-01T10:00:00+07:00');
const KHUONG_JOINED_AT = new Date('2026-10-02T10:00:00+07:00');
const ADMINS_LAST_WROTE_AT = new Date('2026-11-01T10:00:00+07:00');
const SAVED_REPLY = 'Đã lưu: Đổ xăng dầu, số 0001234, 1.250.000đ, ngày 30/10/2026.';
const NOTICE_TEXT = `Hùng gửi ảnh vào nhóm "Xe tải Duy Khương" lúc 10:00 02/11/2026.\nTrợ lý đã trả lời Hùng:\n${SAVED_REPLY}`;
const UNRESOLVED_REPLY =
  'Tôi đọc ảnh này chưa chắc chắn nên chưa lưu. Bạn chụp lại gần hơn, đủ sáng, hoặc nhắn rõ nội dung, ví dụ: "Thay dầu máy 850.000đ ngày 30/10".';
const DUPLICATE_REPLY = 'Ảnh hoặc chứng từ này đã có trong nhóm. Tôi chưa lưu bản trùng. Bạn kiểm tra lại nhé.';
const PHOTO = { bytes: makeJpeg(1000), contentType: 'image/jpeg' };

describe('notices to admins about a member photo', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId } = harness);
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    await insertAdmin('zu-duy', 'Duy', DUY_JOINED_AT);
    await insertAdmin('zu-khuong', 'Khương', KHUONG_JOINED_AT);
    answerWithFuelItem();
  });

  afterEach(async () => {
    await harness.close();
  });

  function insertAdmin(
    externalUserId: string,
    displayName: string,
    joinedAt: Date,
    inWorkspaceId: string = workspaceId,
  ): Promise<string> {
    return insertMember(database, {
      workspaceId: inWorkspaceId,
      joinedAt,
      externalUserId,
      displayName,
      role: 'admin',
      lastInboundAt: ADMINS_LAST_WROTE_AT,
    });
  }

  function answerWithFuelItem(): void {
    for (const reader of harness.readers.cheap) reader.answerWith(makeReading([makeFuelItem()]));
  }

  function makeFuelItem() {
    return makeItem({ category: 'fuel', amount_vnd: 1250000, occurred_on: '2026-10-30', document_number: '0001234' });
  }

  function readSendsTo(externalUserId: string) {
    return harness.channel.sends.filter((sent) => sent.to === externalUserId);
  }

  it('sends each admin the notice and then the photo, after the member reply', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải Thử');
    await insertAdmin('zu-vy', 'Vy', DUY_JOINED_AT, otherWorkspaceId);

    await harness.receivePhoto('zu-hung');
    await harness.sendAllQueuedTexts();

    expect(harness.channel.sends).toEqual([
      { kind: 'text', to: 'zu-hung', text: SAVED_REPLY },
      { kind: 'text', to: 'zu-duy', text: NOTICE_TEXT },
      { kind: 'image', to: 'zu-duy', photo: PHOTO },
      { kind: 'text', to: 'zu-khuong', text: NOTICE_TEXT },
      { kind: 'image', to: 'zu-khuong', photo: PHOTO },
    ]);
  });

  it('marks the notice rows with the admin membership and the hold marker', async () => {
    await harness.receivePhoto('zu-hung');

    expect(
      await database.query(
        `SELECT outbound.kind, outbound.requires_open_window, outbound.admin_membership_id = membership.id AS is_duys
         FROM outbound_messages outbound
         LEFT JOIN memberships membership ON membership.display_name = 'Duy'
         WHERE outbound.external_user_id = 'zu-duy' ORDER BY outbound.seq`,
      ),
    ).toEqual([
      { kind: 'text', requires_open_window: true, is_duys: true },
      { kind: 'image', requires_open_window: true, is_duys: true },
    ]);
    expect(await database.query("SELECT admin_membership_id, requires_open_window FROM outbound_messages WHERE external_user_id = 'zu-hung'")).toEqual([
      { admin_membership_id: null, requires_open_window: false },
    ]);
  });

  it('announces an unread photo with the reply the member got', async () => {
    for (const pair of [harness.readers.cheap, harness.readers.strong]) {
      pair[0].answerWith(makeReading([makeFuelItem()]));
      pair[1].answerWith(makeReading([makeItem({ ...makeFuelItem(), amount_vnd: 1250001 })]));
    }

    await harness.receivePhoto('zu-hung');
    await harness.sendAllQueuedTexts();

    expect(readSendsTo('zu-duy')).toEqual([
      {
        kind: 'text',
        to: 'zu-duy',
        text: `Hùng gửi ảnh vào nhóm "Xe tải Duy Khương" lúc 10:00 02/11/2026.\nTrợ lý đã trả lời Hùng:\n${UNRESOLVED_REPLY}`,
      },
      { kind: 'image', to: 'zu-duy', photo: PHOTO },
    ]);
  });

  it('announces a duplicate photo as a duplicate', async () => {
    await harness.receivePhoto('zu-hung');

    await harness.receivePhoto('zu-hung');
    await harness.sendAllQueuedTexts();

    const sentToDuy = readSendsTo('zu-duy');
    expect(sentToDuy).toHaveLength(4);
    expect(sentToDuy[2]).toMatchObject({ kind: 'text', text: expect.stringMatching(new RegExp(`${DUPLICATE_REPLY}$`)) });
    expect(sentToDuy[3]).toEqual({ kind: 'image', to: 'zu-duy', photo: PHOTO });
  });
});
