import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import type { PoolClient } from 'pg';
import { up } from '../../src/app/db/migrations/0107_move_company_rules_to_company_knowledge.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { restoreOldCompanyRules } from './support/old-company-rules.ts';
import { resetDatabase } from './support/reset-database.ts';
import { A_ADMIN_USER_ID, WORKSPACE_A_ID } from './support/seed-ids.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

type OldRule = { rule: string; createdAt: string };

test('the migration merges two rules that differ only in case and spaces', async () => {
  await migrateRules([{ rule: 'Hàng A  chỉ đổ ở B', createdAt: '2026-03-01' }, { rule: 'hàng a chỉ đổ ở b', createdAt: '2026-03-02' }], async (client) => {
    assert.deepEqual(await listMovedNotes(client), ['Hàng A  chỉ đổ ở B']);
  });
});

test('the migration removes the old rule table', async () => {
  await migrateRules([{ rule: 'gửi phiếu trước 18 giờ', createdAt: '2026-03-01' }], async (client) => {
    const { rows } = await client.query<{ old_table: string | null }>(`SELECT to_regclass('workspace_rules')::text AS old_table`);
    assert.deepEqual(rows, [{ old_table: null }]);
  });
});

async function migrateRules(rules: OldRule[], check: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await databases.owner.connect();
  try {
    await client.query('BEGIN');
    await restoreOldCompanyRules(client);
    for (const rule of rules) await insertRule(client, rule);
    await runMigration(client);
    await check(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function insertRule(client: PoolClient, { rule, createdAt }: OldRule): Promise<void> {
  await client.query('INSERT INTO workspace_rules (workspace_id, author_user_id, rule, created_at) VALUES ($1, $2, $3, $4)', [WORKSPACE_A_ID, A_ADMIN_USER_ID, rule, createdAt]);
}

async function runMigration(client: PoolClient): Promise<void> {
  const statements: string[] = [];
  up({ sql: (statement) => statements.push(statement), noTransaction: () => undefined });
  for (const statement of statements) await client.query(statement);
}

async function listMovedNotes(client: PoolClient): Promise<string[]> {
  const { rows } = await client.query<{ then_note: string }>(
    `SELECT then_note FROM company_knowledge_entries WHERE workspace_id = $1 AND then_note IS NOT NULL AND when_goods IS NULL AND when_pickup_match_key IS NULL AND when_dropoff_match_key IS NULL AND when_vehicle_plate IS NULL AND when_driver_user_id IS NULL`,
    [WORKSPACE_A_ID],
  );
  return rows.map((row) => row.then_note);
}
