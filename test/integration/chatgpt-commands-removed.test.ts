import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertMember } from './workspace-rows.ts';

describe('the removed ChatGPT commands', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    await insertMember(harness.database, { workspaceId: harness.workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    harness.reader.answerWith(makeReading([], { has_work_data: false }));
  });

  afterEach(async () => {
    await harness.close();
  });

  it('reads "đăng nhập" as an ordinary text and sends no login code', async () => {
    await harness.receiveText('zu-duy', 'đăng nhập');
    await harness.sendAllQueuedTexts();

    expect(harness.reader.requests.map(({ text }) => text)).toEqual(['đăng nhập']);
    expect(harness.channel.texts.map(({ text }) => text)).not.toContainEqual(expect.stringMatching(/^\S{4}-\S{4}$/));
  });

  it('reads "ngắt ChatGPT" as an ordinary text', async () => {
    await harness.receiveText('zu-duy', 'ngắt ChatGPT');
    await harness.sendAllQueuedTexts();

    expect(harness.reader.requests.map(({ text }) => text)).toEqual(['ngắt ChatGPT']);
  });
});
