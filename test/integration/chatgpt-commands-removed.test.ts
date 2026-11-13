import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/bootstrap/server.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { makeUserInternal } from './internal-user-rows.ts';
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

  it('still lets an internal user log in to /admin with the code of "đăng nhập quản trị"', async () => {
    const userId = await insertMember(harness.database, { workspaceId: harness.workspaceId, externalUserId: 'zu-admin', displayName: 'Admin', role: 'admin' });
    await makeUserInternal(harness.database, userId);

    await harness.receiveText('zu-admin', 'đăng nhập quản trị');
    await harness.sendAllQueuedTexts();
    const code = harness.channel.texts[1]?.text ?? '';
    const server = buildServer(harness.pool, null, { internalAdmin: { database: harness.pool, clock: harness.clock } });
    const response = await server.inject({
      method: 'POST',
      url: '/admin/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ code }).toString(),
    });

    expect(code).toMatch(/^\S{4}-\S{4}$/);
    expect(response.statusCode).toBe(303);
    expect(String(response.headers['set-cookie'])).toContain('__Host-internal-session=');
  });
});
