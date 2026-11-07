import { describe, expect, it } from 'vitest';
import { describeMcpServer } from '../../../src/app/chatgpt/describe-mcp-server.ts';
import { SCHEDULED_RUN_TOOLS } from '../../../src/app/scheduled-runs/scheduled-tools.ts';
import { FakeClock } from '../../fakes/fake-clock.ts';

describe('the number tools outside the admin chat', () => {
  it('stays out of the scheduled tool list', () => {
    const names = SCHEDULED_RUN_TOOLS.map((tool) => tool.name);

    expect(names).not.toContain('list_number_labels');
    expect(names).not.toContain('total_numbers');
  });

  it('stays out of the ChatGPT tool list', () => {
    const database = {
      connect: () => Promise.reject(new Error('the database must not be used')),
      query: () => Promise.reject(new Error('the database must not be used')),
    };
    const runtime = { database, clock: new FakeClock(new Date('2026-11-07T10:00:00+07:00')), photoStorage: null, reader: null };
    const scope = { workspaceId: 'workspace-1', userId: 'user-1', role: 'admin' } as const;

    const names = describeMcpServer(runtime, scope).tools.map((tool) => tool.name);

    expect(names).not.toContain('list_number_labels');
    expect(names).not.toContain('total_numbers');
  });
});
