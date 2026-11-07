import { describe, expect, it } from 'vitest';
import { describeMcpServer } from '../../../src/app/chatgpt/describe-mcp-server.ts';
import { SEARCH_RECORDS_SPEC } from '../../../src/app/admin-chat/tools/tool-specs.ts';
import { SCHEDULED_RUN_TOOLS } from '../../../src/app/scheduled-runs/scheduled-tools.ts';
import { FakeClock } from '../../fakes/fake-clock.ts';

describe('the search_records spec outside the admin chat', () => {
  it('stays without a document date range in the scheduled tool list', () => {
    const tool = SCHEDULED_RUN_TOOLS.find((candidate) => candidate.name === 'search_records');

    expect(tool).toEqual(SEARCH_RECORDS_SPEC);
    expect(Object.keys(tool?.parameters['properties'] as Record<string, unknown>)).not.toContain('occurred_from');
  });

  it('stays without a document date range in the ChatGPT tool list', () => {
    const database = {
      connect: () => Promise.reject(new Error('the database must not be used')),
      query: () => Promise.reject(new Error('the database must not be used')),
    };
    const runtime = { database, clock: new FakeClock(new Date('2026-11-02T10:00:00+07:00')), photoStorage: null, reader: null };
    const scope = { workspaceId: 'workspace-1', userId: 'user-1', role: 'admin' } as const;

    const tool = describeMcpServer(runtime, scope).tools.find((candidate) => candidate.name === 'search_records');

    expect(tool?.inputSchema).toEqual(SEARCH_RECORDS_SPEC.parameters);
    expect(Object.keys(tool?.inputSchema['properties'] as Record<string, unknown>)).not.toContain('occurred_from');
  });
});
