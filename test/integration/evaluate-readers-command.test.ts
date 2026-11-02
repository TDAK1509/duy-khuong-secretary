import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { makeCompletionReply, startStubChatServer, type StubChatServer } from './stub-chat-server.ts';

const runNode = promisify(execFile);

describe('evaluate-readers command', () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  function makeSlotEnvironment(server: StubChatServer): Record<string, string> {
    const slots = ['READER_CHEAP_1', 'READER_CHEAP_2', 'READER_STRONG_1', 'READER_STRONG_2'];
    return Object.fromEntries([
      ['READER_PROVIDER', 'openai-compatible'],
      ...slots.flatMap((slot) => [
        [`${slot}_BASE_URL`, server.baseUrl],
        [`${slot}_API_KEY`, 'test-key'],
        [`${slot}_MODEL`, `${slot.toLowerCase()}-model`],
      ]),
    ]);
  }

  it('refuses to start and names the missing reader values', async () => {
    const run = runNode('node', ['src/bootstrap/evaluate-readers.ts', 'photos'], { env: { PATH: process.env['PATH'] } });

    await expect(run).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('readers is not configured: missing READER_PROVIDER, READER_CHEAP_1_BASE_URL'),
    });
  });

  it('reads a photo folder through the configured readers', async () => {
    const server = await startStubChatServer(makeCompletionReply(JSON.stringify(makeReading([makeItem()]))));
    const folder = await mkdtemp(join(tmpdir(), 'evaluate-readers-command-'));
    cleanups.push(() => server.close(), () => rm(folder, { recursive: true, force: true }));
    await writeFile(join(folder, 'receipt.jpg'), new Uint8Array([1, 2, 3]));
    const env = { PATH: process.env['PATH'], ...makeSlotEnvironment(server) };

    const { stdout } = await runNode('node', ['src/bootstrap/evaluate-readers.ts', folder], { env });

    expect(stdout).toContain('cheap_pair: 1');
    expect(server.requests).toHaveLength(2);
  });
});
