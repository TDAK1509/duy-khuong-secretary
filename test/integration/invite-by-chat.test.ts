import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FakeReader } from '../fakes/fake-reader.ts';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const ANSWER_TEXT = 'Đã tạo mã mời cho An.';

describe('an admin invites a person by chat', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId } = harness);
    await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    const reading = makeReading([], { has_work_data: false, has_question: true });
    const pair: readonly [FakeReader, FakeReader] = harness.readers.cheap;
    pair.forEach((reader) => reader.answerWith(reading));
    const call = { id: 'call_1', name: 'create_invite', argumentsJson: JSON.stringify({ display_name: 'An', role: 'member' }) };
    harness.chat.follow((_request, callNumber) => (callNumber === 1 ? replyWithToolCalls(call) : replyWithText(ANSWER_TEXT)));
  });

  afterEach(async () => {
    await harness.close();
  });

  async function sendInviteRequest(): Promise<string[][]> {
    await harness.receiveText('zu-duy', 'Mời tài xế An');
    await harness.sendAllQueuedTexts();
    return harness.channel.texts.map((sent) => [sent.to.externalUserId, sent.text]);
  }

  it('sends the invite code alone in a second message after the answer', async () => {
    const sent = await sendInviteRequest();

    expect(sent).toEqual([
      ['zu-duy', ANSWER_TEXT],
      ['zu-duy', expect.stringMatching(/^MOI-[A-Z2-9]{6}$/)],
    ]);
  });

  it('lets the invited person join by sending the copied code message', async () => {
    const [, codeMessage] = await sendInviteRequest();

    await harness.receiveText('zu-an', codeMessage?.[1] ?? '');

    expect(await database.query(`SELECT display_name, role FROM memberships WHERE display_name = 'An'`)).toEqual([
      { display_name: 'An', role: 'member' },
    ]);
  });
});
