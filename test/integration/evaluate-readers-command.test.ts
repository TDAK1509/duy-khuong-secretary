import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const runNode = promisify(execFile);

describe('evaluate-readers command', () => {
  it('refuses to start and names the missing reader values', async () => {
    const run = runNode('node', ['src/bootstrap/evaluate-readers.ts', 'photos'], { env: { PATH: process.env['PATH'] } });

    await expect(run).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('readers is not configured: missing READER_PROVIDER, READER_CHEAP_1_BASE_URL'),
    });
  });
});
