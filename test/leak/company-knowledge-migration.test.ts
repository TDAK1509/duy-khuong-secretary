import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import type { PoolClient } from 'pg';
import { up } from '../../src/app/db/migrations/0100_move_facts_to_company_knowledge.ts';
import { buildMatchKey } from '../../src/app/documents/build-match-key.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { restoreOldFactTables } from './support/old-fact-tables.ts';
import { resetDatabase } from './support/reset-database.ts';
import { A_ADMIN_USER_ID, WORKSPACE_A_ID } from './support/seed-ids.ts';

const A_DRIVER_USER_ID = 'aaaaaaaa-0001-4000-8000-000000000002';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

type OldValue = { name: string; number?: number; unit?: string; text?: string };

type OldFact = { pickup?: string; dropoff?: string; driver?: boolean; values: OldValue[] };

type Migrated = { client: PoolClient; notices: string[] };

type Entry = Record<string, string | null>;

test('the migration moves a route fact conditions into the entry', async () => {
  const fact = { pickup: 'Alpha', dropoff: 'Beta', values: [{ name: 'Hàng hóa', text: 'Đá' }, WAGE] };
  await migrateOldFacts([fact], async ({ client }) => {
    const entries = await listEntries(client, ['when_pickup_name', 'when_dropoff_name', 'when_goods']);
    assert.deepEqual(entries, [{ when_pickup_name: 'Alpha', when_dropoff_name: 'Beta', when_goods: 'Đá' }]);
  });
});

test('the migration moves a route fact outcomes into fixed columns', async () => {
  const customer = { name: 'Khách hàng', text: 'Gamma' };
  const rate = { name: 'Cước vận chuyển', number: 150000, unit: 'đ/tấn' };
  const allowance = { name: 'Chi phí bồi dưỡng', number: 100000, unit: 'đ' };
  await migrateOldFacts([{ pickup: 'Alpha', dropoff: 'Beta', values: [customer, WAGE, rate, allowance] }], async ({ client }) => {
    const columns = ['then_dropoff', 'then_customer', 'then_wage_vnd', 'then_rate_vnd_per_ton', 'then_allowance_vnd'];
    assert.deepEqual(await listEntries(client, columns), [
      { then_dropoff: null, then_customer: 'Gamma', then_wage_vnd: '700000', then_rate_vnd_per_ton: '150000', then_allowance_vnd: '100000' },
    ]);
  });
});

test('the migration keeps a drop-off-only fact drop-off as a condition', async () => {
  const allowance = { name: 'Chi phí bồi dưỡng', number: 100000, unit: 'đ' };
  await migrateOldFacts([{ dropoff: 'Beta', values: [allowance] }], async ({ client }) => {
    assert.deepEqual(await listEntries(client, ['when_dropoff_name', 'then_dropoff']), [{ when_dropoff_name: 'Beta', then_dropoff: null }]);
  });
});

const WAGE = { name: 'Lương tài xế', number: 700000, unit: 'đ' };

async function migrateOldFacts(facts: OldFact[], check: (migrated: Migrated) => Promise<void>): Promise<void> {
  const client = await databases.owner.connect();
  const notices: string[] = [];
  client.on('notice', (notice) => notices.push(notice.message ?? ''));
  try {
    await client.query('BEGIN');
    await restoreOldFactTables(client);
    for (const fact of facts) await insertOldFact(client, fact);
    await runMigration(client);
    await check({ client, notices });
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function insertOldFact(client: PoolClient, { pickup, dropoff, driver, values }: OldFact): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO facts (workspace_id, author_user_id, statement, driver_user_id, pickup_name, pickup_match_key, dropoff_name, dropoff_match_key)
     VALUES ($1, $2, 'fixture fact', $3, $4, $5, $6, $7) RETURNING id`,
    [WORKSPACE_A_ID, A_ADMIN_USER_ID, driver === true ? A_DRIVER_USER_ID : null, pickup ?? null, pickup === undefined ? null : buildMatchKey(pickup), dropoff ?? null, dropoff === undefined ? null : buildMatchKey(dropoff)],
  );
  for (const [position, value] of values.entries()) await insertOldValue(client, rows[0]?.id, position, value);
}

async function insertOldValue(client: PoolClient, factId: string | undefined, position: number, { name, number, unit, text }: OldValue): Promise<void> {
  await client.query(
    'INSERT INTO fact_values (workspace_id, fact_id, position, name, match_key, number, unit, text_value) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [WORKSPACE_A_ID, factId, position, name, buildMatchKey(name), number ?? null, unit ?? null, text ?? null],
  );
}

async function runMigration(client: PoolClient): Promise<void> {
  const statements: string[] = [];
  up({ sql: (statement) => statements.push(statement), noTransaction: () => undefined });
  for (const statement of statements) await client.query(statement);
}

async function listEntries(client: PoolClient, columns: string[]): Promise<Entry[]> {
  const { rows } = await client.query<Entry>(`SELECT ${columns.map((column) => `${column}::text AS ${column}`).join(', ')} FROM company_knowledge_entries WHERE workspace_id = $1 ORDER BY created_at, id`, [WORKSPACE_A_ID]);
  return rows;
}
