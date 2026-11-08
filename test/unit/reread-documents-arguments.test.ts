import { describe, expect, it } from 'vitest';
import { runRereadDocumentsCommand } from '../../src/bootstrap/reread-documents.ts';

const USAGE =
  'Usage: node dist/bootstrap/reread-documents.js <workspace-uuid> [--test-photo <message-uuid>]... [--apply]';
const SOME_WORKSPACE_ID = '5d1f3c1e-6a1f-4a0b-9d0e-1c2b3a4d5e6f';
const UNUSED_DATABASE_URL = 'postgres://app_runtime:unused@localhost:1/unused';

describe('the arguments of the reread-documents command', () => {
  it('prints the usage and exits 1 when --test-photo has no id', async () => {
    const lines: string[] = [];

    const exitCode = await runRereadDocumentsCommand(
      [SOME_WORKSPACE_ID, '--test-photo'],
      { DATABASE_URL: UNUSED_DATABASE_URL },
      { log: (line) => lines.push(line) },
    );

    expect(exitCode).toBe(1);
    expect(lines).toEqual([USAGE]);
  });
});
