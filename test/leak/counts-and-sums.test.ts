import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import type { PostgresPool } from '../../src/providers/database/postgres.ts';
import { findAttackCase } from './support/attack-cases.ts';
import { callChatTool } from './support/call-chat-tool.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { resetDatabase } from './support/reset-database.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test('counts and sums hold only A values under the runtime role', () => assertCountsAndSumsHoldOnlyAValues(databases.runtime));

test('counts and sums hold only A values under the owner role', () => assertCountsAndSumsHoldOnlyAValues(databases.owner));

async function assertCountsAndSumsHoldOnlyAValues(database: PostgresPool): Promise<void> {
  assert.deepEqual(await callAttackCase(database, 'count_records'), {
    members: [
      { member: 'SAFE-A-ADMIN', total_count: 0, by_category: [] },
      { member: 'SAFE-A-DRIVER', total_count: 2, by_category: [{ category: 'bảo dưỡng', count: 1, amount_vnd: 250000 }, { category: 'phiếu cân', count: 1, amount_vnd: 1000000 }] },
    ],
  });
  const documentTotals = await callAttackCase(database, 'total_document_numbers');
  assert.deepEqual(documentTotals['groups'], [{ group: null, unit: 'kg', count: 1, sum: '700', min: '700', max: '700' }]);
  const factTotals = await callAttackCase(database, 'total_company_knowledge');
  assert.deepEqual(factTotals['amounts'], [{ group: null, unit: 'đ', documents: 1, sum: 500000, values: [{ number: '500000', documents: 1 }] }]);
}

async function callAttackCase(database: PostgresPool, name: string): Promise<Record<string, unknown>> {
  const output = await callChatTool(database, name, findAttackCase(name).arguments);
  return JSON.parse(output) as Record<string, unknown>;
}
