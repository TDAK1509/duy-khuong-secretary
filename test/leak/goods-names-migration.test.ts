import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import type { PoolClient } from 'pg';
import { up } from '../../src/app/db/migrations/0101_move_goods_names_to_company_knowledge.ts';
import { buildMatchKey } from '../../src/app/documents/build-match-key.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { restoreOldGoodsNames } from './support/old-goods-names.ts';
import { resetDatabase } from './support/reset-database.ts';
import { A_ADMIN_USER_ID, WORKSPACE_A_ID } from './support/seed-ids.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

type MovedEntry = { when_goods: string | null; then_shown_goods_name: string | null; statement: string };

test('the migration turns a goods-name row into an entry', async () => {
  await migrateGoodsName('Than Da', 'Than đá', async (client) => {
    assert.deepEqual(await listMovedEntries(client), [{ when_goods: 'Than Da', then_shown_goods_name: 'Than đá', statement: 'Than Da → Than đá' }]);
  });
});

test('the migration removes the old goods-name table', async () => {
  await migrateGoodsName('Than Da', 'Than đá', async (client) => {
    const { rows } = await client.query<{ old_table: string | null }>(`SELECT to_regclass('goods_names')::text AS old_table`);
    assert.deepEqual(rows, [{ old_table: null }]);
  });
});

async function migrateGoodsName(writtenName: string, shownName: string, check: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await databases.owner.connect();
  try {
    await client.query('BEGIN');
    await restoreOldGoodsNames(client);
    await insertGoodsName(client, writtenName, shownName);
    await runMigration(client);
    await check(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function insertGoodsName(client: PoolClient, writtenName: string, shownName: string): Promise<void> {
  await client.query(
    'INSERT INTO goods_names (workspace_id, author_user_id, written_name, match_key, shown_name) VALUES ($1, $2, $3, $4, $5)',
    [WORKSPACE_A_ID, A_ADMIN_USER_ID, writtenName, buildMatchKey(writtenName), shownName],
  );
}

async function runMigration(client: PoolClient): Promise<void> {
  const statements: string[] = [];
  up({ sql: (statement) => statements.push(statement), noTransaction: () => undefined });
  for (const statement of statements) await client.query(statement);
}

async function listMovedEntries(client: PoolClient): Promise<MovedEntry[]> {
  const { rows } = await client.query<MovedEntry>('SELECT when_goods, then_shown_goods_name, statement FROM company_knowledge_entries WHERE workspace_id = $1 AND then_shown_goods_name IS NOT NULL', [WORKSPACE_A_ID]);
  return rows;
}
