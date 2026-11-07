import { describe, expect, it } from 'vitest';
import type { Database } from '../../../src/app/db/transaction.ts';
import { runSearchRecords } from '../../../src/app/admin-chat/tools/search-records-tool.ts';

describe('the search_records runner', () => {
  const database: Database = {
    connect: () => Promise.reject(new Error('the database must not be used')),
    query: () => Promise.reject(new Error('the database must not be used')),
  };
  const scope = { workspaceId: 'workspace-1', userId: 'user-1', role: 'admin' } as const;
  const noFilters = { text: null, category: null, member: null, plate: null, added_from: null, added_to: null, occurred_from: null, occurred_to: null, cursor: null };

  it.each(['occurred_from', 'occurred_to'])('refuses an impossible date in %s', async (key) => {
    const output = await runSearchRecords(database, scope, { ...noFilters, [key]: '2026-02-30' });

    expect(output).toBe('{"ok":false,"error":"Ngày không hợp lệ."}');
  });
});
