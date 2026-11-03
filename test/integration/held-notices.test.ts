import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIntakeHarness, makeJpeg, NOW, type IntakeHarness } from './intake-harness.ts';
import { insertOutboundMessage, type NewOutboundMessage } from './outbound-message-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const DAY_MS = 24 * 60 * 60_000;
const PHOTO_KEY = 'notice/1.jpg';

describe('notices that are held when the window is closed', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let duyMembershipId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database } = harness);
    const duyUserId = await insertMember(database, {
      workspaceId: harness.workspaceId,
      externalUserId: 'zu-duy',
      displayName: 'Duy',
      role: 'admin',
    });
    const [membership] = await database.query<{ id: string }>(`SELECT id FROM memberships WHERE user_id = '${duyUserId}'`);
    duyMembershipId = membership?.id ?? '';
    await harness.photoStorage.put(PHOTO_KEY, { bytes: makeJpeg(100), contentType: 'image/jpeg' });
  });

  afterEach(async () => {
    await harness.close();
  });

  function duyWroteDaysAgo(days: number): Promise<unknown> {
    const lastInboundAt = new Date(NOW.getTime() - days * DAY_MS).toISOString();
    return database.query(`UPDATE channel_identities SET last_inbound_at = '${lastInboundAt}' WHERE external_user_id = 'zu-duy'`);
  }

  function insertNotice(message: NewOutboundMessage = {}): Promise<string> {
    return insertOutboundMessage(database, {
      externalUserId: 'zu-duy',
      adminMembershipId: duyMembershipId,
      requiresOpenWindow: true,
      ...message,
    });
  }

  function readRows(): Promise<{ kind: string; status: string; last_error: string | null }[]> {
    return database.query('SELECT kind, status, last_error FROM outbound_messages ORDER BY seq');
  }

  it('holds both rows of a notice when the admin wrote 8 days ago', async () => {
    await duyWroteDaysAgo(8);
    await insertNotice({ body: 'Thông báo 1' });
    await insertNotice({ photoKey: PHOTO_KEY });

    await harness.sendQueuedTexts();
    await harness.sendQueuedTexts();

    expect(await readRows()).toEqual([
      { kind: 'text', status: 'held', last_error: 'outside_window' },
      { kind: 'image', status: 'held', last_error: 'outside_window' },
    ]);
    expect(harness.channel.sends).toEqual([]);
  });

  it('holds a notice when Zalo answers that the window is closed', async () => {
    await duyWroteDaysAgo(2);
    await insertNotice({ body: 'Thông báo 1' });
    harness.channel.nextTextResult = { ok: false, reason: 'window_closed' };

    await harness.sendQueuedTexts();

    expect(await readRows()).toEqual([{ kind: 'text', status: 'held', last_error: 'window_closed' }]);
  });

  it('queues one template with the photo title for a held notice', async () => {
    harness.setReportReadyTemplate('tpl-1');
    await duyWroteDaysAgo(8);
    await insertNotice({ body: 'Thông báo 1' });

    await harness.sendAllQueuedTexts();

    expect(harness.channel.templates).toEqual([
      {
        to: { channel: 'zalo-oa', accountId: 'oa-1', externalUserId: 'zu-duy' },
        templateId: 'tpl-1',
        params: { task_title: 'Ảnh mới trong nhóm' },
        credential: 'a1',
      },
    ]);
  });

  it('queues only one template for many held notices', async () => {
    harness.setReportReadyTemplate('tpl-1');
    await duyWroteDaysAgo(8);
    for (const number of [1, 2, 3]) {
      await insertNotice({ body: `Thông báo ${number}` });
      await insertNotice({ photoKey: PHOTO_KEY });
    }

    await harness.sendAllQueuedTexts();

    expect(harness.channel.templates).toHaveLength(1);
    expect(await database.query("SELECT 1 FROM outbound_messages WHERE status = 'held'")).toHaveLength(6);
  });

  it('keeps notices held and sends no template without a template id', async () => {
    await duyWroteDaysAgo(8);
    await insertNotice({ body: 'Thông báo 1' });
    await insertNotice({ photoKey: PHOTO_KEY });

    await harness.sendAllQueuedTexts();

    expect(await readRows()).toEqual([
      { kind: 'text', status: 'held', last_error: 'outside_window' },
      { kind: 'image', status: 'held', last_error: 'outside_window' },
    ]);
    expect(harness.channel.templates).toEqual([]);
  });
});
