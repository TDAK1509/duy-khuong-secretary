import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import type { PoolClient } from 'pg';
import { up } from '../../src/app/db/migrations/0100_move_facts_to_company_knowledge.ts';
import { buildMatchKey } from '../../src/app/documents/build-match-key.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { restoreOldFactTables } from './support/old-fact-tables.ts';
import { resetDatabase } from './support/reset-database.ts';
import { A_ADMIN_USER_ID, WORKSPACE_A_ID } from './support/seed-ids.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

type OldValue = { name: string; number?: number; unit?: string; text?: string };

type OldFact = { pickup: string; dropoff?: string; values: OldValue[] };

type Migrated = { client: PoolClient; notices: string[] };

type Entry = Record<string, string | null>;

test('the migration moves a route fact conditions into the entry', async () => {
  const fact = { pickup: 'Alpha', dropoff: 'Beta', values: [{ name: 'Hàng hóa', text: 'Đá' }, WAGE] };
  await migrateOldFacts([fact], async ({ client }) => {
    const entries = await listEntries(client, ['when_pickup_name', 'when_dropoff_name', 'when_goods']);
    assert.deepEqual(entries, [{ when_pickup_name: 'Alpha', when_dropoff_name: 'Beta', when_goods: 'Đá' }]);
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

async function insertOldFact(client: PoolClient, { pickup, dropoff, values }: OldFact): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO facts (workspace_id, author_user_id, statement, pickup_name, pickup_match_key, dropoff_name, dropoff_match_key)
     VALUES ($1, $2, 'fixture fact', $3, $4, $5, $6) RETURNING id`,
    [WORKSPACE_A_ID, A_ADMIN_USER_ID, pickup, buildMatchKey(pickup), dropoff ?? null, dropoff === undefined ? null : buildMatchKey(dropoff)],
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
