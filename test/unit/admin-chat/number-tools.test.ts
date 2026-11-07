import { describe, expect, it } from 'vitest';
import type { Database } from '../../../src/app/db/transaction.ts';
import { runListNumberLabels } from '../../../src/app/admin-chat/tools/list-number-labels-tool.ts';
import { runTotalNumbers } from '../../../src/app/admin-chat/tools/total-numbers-tool.ts';

describe('the number tool runners', () => {
  const database: Database = {
    connect: () => Promise.reject(new Error('the database must not be used')),
    query: () => Promise.reject(new Error('the database must not be used')),
  };
  const scope = { workspaceId: 'workspace-1', userId: 'user-1', role: 'admin' } as const;
  const noFilters = { text: null, category: null, member: null, plate: null, added_from: null, added_to: null, occurred_from: null, occurred_to: null };

  it('refuses an impossible document date in total_numbers', async () => {
    const output = await runTotalNumbers(database, scope, { label: 'Trọng lượng hàng', ...noFilters, occurred_to: '2026-13-01', group_by: 'none' });

    expect(output).toBe('{"ok":false,"error":"Ngày không hợp lệ."}');
  });

  it.each(['added_from', 'added_to', 'occurred_from', 'occurred_to'])('refuses an impossible date in %s of list_number_labels', async (key) => {
    const output = await runListNumberLabels(database, scope, { ...noFilters, [key]: '2026-02-30' });

    expect(output).toBe('{"ok":false,"error":"Ngày không hợp lệ."}');
  });
});
