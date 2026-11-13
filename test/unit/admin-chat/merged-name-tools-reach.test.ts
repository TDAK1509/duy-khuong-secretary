import { describe, expect, it } from 'vitest';
import { describeMcpServer } from '../../../src/app/chatgpt/describe-mcp-server.ts';
import { ADMIN_TOOLS } from '../../../src/app/admin-chat/tools/admin-tools.ts';
import { MEMBER_TOOLS } from '../../../src/app/admin-chat/tools/member-tools.ts';
import { SCHEDULED_RUN_TOOLS } from '../../../src/app/scheduled-runs/scheduled-tools.ts';
import { FakeClock } from '../../fakes/fake-clock.ts';

const MERGED_NAME_TOOLS = ['list_merged_names', 'split_merged_name'];

describe('the merged name tools outside the admin chat', () => {
  it('reaches the admin tool list', () => {
    const names = ADMIN_TOOLS.map((tool) => tool.name);

    expect(names).toEqual(expect.arrayContaining(MERGED_NAME_TOOLS));
  });

  it('stays out of the member tool list', () => {
    const names = MEMBER_TOOLS.map((tool) => tool.name);

    for (const toolName of MERGED_NAME_TOOLS) expect(names).not.toContain(toolName);
  });

  it('stays out of the scheduled tool list', () => {
    const names = SCHEDULED_RUN_TOOLS.map((tool) => tool.name);

    for (const toolName of MERGED_NAME_TOOLS) expect(names).not.toContain(toolName);
  });

  it('stays out of the ChatGPT tool list', () => {
    const database = {
      connect: () => Promise.reject(new Error('the database must not be used')),
      query: () => Promise.reject(new Error('the database must not be used')),
    };
    const runtime = { database, clock: new FakeClock(new Date('2026-11-07T10:00:00+07:00')), photoStorage: null, reader: null, maxTextLength: 2000 };
    const scope = { workspaceId: 'workspace-1', userId: 'user-1', role: 'admin' } as const;

    const names = describeMcpServer(runtime, scope).tools.map((tool) => tool.name);

    for (const toolName of MERGED_NAME_TOOLS) expect(names).not.toContain(toolName);
  });
});
