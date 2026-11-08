import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildMatchKey } from '../../src/app/documents/build-match-key.ts';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { insertOrganizationWithAlias } from './document-rows.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const ADMIN_LAST_WROTE_AT = new Date('2026-11-01T10:00:00+07:00');
const CHENG_LOONG = 'Công ty TNHH Cheng Loong Bình Dương Paper';
const CHONG_LOONG = 'Công ty TNHH Chống Loong Bình Dương Paper';
const ANSWER_TEXT = 'Có 1 cặp tên đang chờ xác nhận.';
const REVIEW_CALL = { id: 'call_1', name: 'review_name_matches', argumentsJson: '{}' };

describe('an admin asks for the names waiting for confirmation', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let chengLoongId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database } = harness);
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    await insertMember(database, {
      workspaceId: harness.workspaceId,
      externalUserId: 'zu-duy',
      displayName: 'Duy',
      role: 'admin',
      lastInboundAt: ADMIN_LAST_WROTE_AT,
    });
    chengLoongId = await insertOrganizationWithAlias(database, { workspaceId: harness.workspaceId, name: CHENG_LOONG });
  });

  afterEach(async () => {
    await harness.close();
  });

  async function waitForMisreadParty(): Promise<void> {
    const misread = { role: 'issuer', type: 'company', printed_name: CHONG_LOONG, known_name: CHENG_LOONG };
    const item = makeItem({ category: 'phiếu cân', amount_vnd: null, occurred_on: '2026-11-05', document_number: '20261105062', parties: [misread] });
    harness.reader.answerWith(makeReading([item]));
    await harness.receivePhoto('zu-hung');
    await harness.sendAllQueuedTexts();
    harness.channel.sends.splice(0);
  }

  async function askForNames(): Promise<string[]> {
    harness.reader.answerWith(makeReading([], { has_work_data: false, has_question: true }));
    const toolResults: string[] = [];
    harness.chat.follow((request, callNumber) => {
      const last = request.turns.at(-1);
      if (last?.role === 'tool_result') toolResults.push(last.output);
      return callNumber === 1 ? replyWithToolCalls(REVIEW_CALL) : replyWithText(ANSWER_TEXT);
    });
    await harness.receiveText('zu-duy', 'có tên nào chờ xác nhận không');
    await harness.sendAllQueuedTexts();
    return toolResults;
  }

  it('sends the proposal after the answer, with the offer, and returns the number of waiting pairs', async () => {
    await waitForMisreadParty();

    const toolResults = await askForNames();

    expect(JSON.parse(toolResults[0] ?? 'null')).toEqual({ ok: true, waiting_pairs: 1 });
    expect(harness.channel.sends.map((sent) => [sent.to, sent.kind === 'text' ? sent.text.split('\n')[0] : sent.kind])).toEqual([
      ['zu-duy', ANSWER_TEXT],
      ['zu-duy', 'Tên mới đọc được gần giống tên đã lưu:'],
    ]);
    expect(await database.query(`SELECT pending_choice FROM channel_identities WHERE external_user_id = 'zu-duy'`)).toEqual([
      {
        pending_choice: {
          kind: 'name_match',
          workspace_id: harness.workspaceId,
          pairs: [{ match_key: buildMatchKey(CHONG_LOONG), organization_id: chengLoongId, printed_name: CHONG_LOONG }],
        },
      },
    ]);
  });

  it('returns 0 and sends no proposal when no pair waits', async () => {
    const toolResults = await askForNames();

    expect(JSON.parse(toolResults[0] ?? 'null')).toEqual({ ok: true, waiting_pairs: 0 });
    expect(harness.channel.sends.map((sent) => [sent.to, sent.kind === 'text' ? sent.text : sent.kind])).toEqual([['zu-duy', ANSWER_TEXT]]);
  });
});
