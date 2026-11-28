import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import type { PoolClient } from 'pg';
import { up } from '../../src/app/db/migrations/0098_move_fact_customer_to_a_value.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { resetDatabase } from './support/reset-database.ts';
import { A_ADMIN_USER_ID, WORKSPACE_A_ID } from './support/seed-ids.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

type OldValue = { name: string; matchKey: string; number?: number; unit?: string };

type OldFact = { customer: string; ageDays: number; values: OldValue[] };

type StoredValue = { name: string; number: string | null; unit: string | null; text_value: string | null };

type Migrated = { client: PoolClient; notices: string[] };

test('the migration turns a customer condition into a value', async () => {
  await migrateOldFacts([{ customer: 'Gamma', ageDays: 0, values: [] }], async ({ client, notices }) => {
    const [fact] = await listRouteFacts(client);
    assert.deepEqual(await listValues(client, fact), [{ name: 'Khách hàng', number: null, unit: null, text_value: 'Gamma' }]);
    const { rows } = await client.query<{ linked: number; unlinked: number }>(
      'SELECT count(DISTINCT link.fact_id)::int AS linked, (SELECT count(*)::int FROM facts) - count(DISTINCT link.fact_id)::int AS unlinked FROM document_facts link',
    );
    assert.equal(rows[0]?.unlinked, 1);
    assert.match(notices.join('\n'), new RegExp(`\\[migration\\] customer_values_added=1 facts_merged=0 facts_relinked=${rows[0]?.linked}$`, 'm'));
  });
});

test('the migration merges two facts that differed only by customer', async () => {
  const wage = { name: 'Lương tài xế', matchKey: 'luongtaixe', number: 700000, unit: 'đ' };
  const rate = { name: 'Cước vận chuyển', matchKey: 'cuocvanchuyen', number: 150000, unit: 'đ/tấn' };
  const olderRateFact = { customer: 'Delta', ageDays: 1, values: [rate] };
  const newerWageFact = { customer: 'Gamma', ageDays: 0, values: [wage] };
  await migrateOldFacts([olderRateFact, newerWageFact], async ({ client }) => {
    const facts = await listRouteFacts(client);
    assert.equal(facts.length, 1);
    assert.deepEqual(await listValues(client, facts[0]), [
      { name: 'Lương tài xế', number: '700000', unit: 'đ', text_value: null },
      { name: 'Khách hàng', number: null, unit: null, text_value: 'Gamma' },
      { name: 'Cước vận chuyển', number: '150000', unit: 'đ/tấn', text_value: null },
    ]);
  });
});

async function migrateOldFacts(facts: OldFact[], check: (migrated: Migrated) => Promise<void>): Promise<void> {
  const client = await databases.owner.connect();
  const notices: string[] = [];
  client.on('notice', (notice) => notices.push(notice.message ?? ''));
  try {
    await client.query('BEGIN');
    await restoreCustomerColumns(client);
    for (const fact of facts) await insertOldFact(client, fact);
    await runMigration(client);
    await check({ client, notices });
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function restoreCustomerColumns(client: PoolClient): Promise<void> {
  await client.query('ALTER TABLE facts ADD COLUMN customer_name text, ADD COLUMN customer_match_key text, ADD COLUMN customer_resolved boolean NOT NULL DEFAULT false');
  await client.query('ALTER TABLE fact_companies DROP CONSTRAINT fact_companies_slot_check');
  await client.query(`ALTER TABLE fact_companies ADD CONSTRAINT fact_companies_slot_check CHECK (slot IN ('pickup', 'dropoff', 'customer'))`);
}

async function insertOldFact(client: PoolClient, { customer, ageDays, values }: OldFact): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO facts (workspace_id, author_user_id, statement, pickup_name, pickup_match_key, customer_name, customer_match_key, created_at, updated_at)
     VALUES ($1, $2, 'fixture fact', 'Alpha', 'alpha', $3, $4, now() - $5 * interval '1 day', now() - $5 * interval '1 day') RETURNING id`,
    [WORKSPACE_A_ID, A_ADMIN_USER_ID, customer, customer.toLowerCase(), ageDays],
  );
  for (const [position, value] of values.entries()) await insertOldValue(client, rows[0]?.id, position, value);
}

async function insertOldValue(client: PoolClient, factId: string | undefined, position: number, { name, matchKey, number, unit }: OldValue): Promise<void> {
  await client.query(
    'INSERT INTO fact_values (workspace_id, fact_id, position, name, match_key, number, unit) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [WORKSPACE_A_ID, factId, position, name, matchKey, number ?? null, unit ?? null],
  );
}

async function runMigration(client: PoolClient): Promise<void> {
  const statements: string[] = [];
  up({ sql: (statement) => statements.push(statement), noTransaction: () => undefined });
  for (const statement of statements) await client.query(statement);
}

async function listRouteFacts(client: PoolClient): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(`SELECT id FROM facts WHERE workspace_id = $1 AND pickup_match_key = 'alpha' ORDER BY id`, [WORKSPACE_A_ID]);
  return rows.map((row) => row.id);
}

async function listValues(client: PoolClient, factId: string | undefined): Promise<StoredValue[]> {
  const { rows } = await client.query<StoredValue>('SELECT name, number::text AS number, unit, text_value FROM fact_values WHERE fact_id = $1 ORDER BY position', [factId]);
  return rows;
}
