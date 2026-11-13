import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { up as grantStartingCredits } from '../../src/app/db/migrations/0048_grant_starting_credits.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertWorkspace } from './workspace-rows.ts';

describe('the migration that grants the starting credits', () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createMigratedDatabase();
  });

  afterEach(async () => {
    await database.drop();
  });

  async function runMigration(): Promise<void> {
    const statements: string[] = [];
    grantStartingCredits({ sql: (statement) => statements.push(statement), noTransaction: () => {} });
    for (const statement of statements) await database.query(statement);
  }

  it('gives each workspace 20,000 credits and one starting grant', async () => {
    await insertWorkspace(database, 'Xe tải Duy Khương');
    await insertWorkspace(database, 'Xe tải Lan');

    await runMigration();

    expect(await database.query('SELECT name, credit_balance FROM workspaces ORDER BY name')).toEqual([
      { name: 'Xe tải Duy Khương', credit_balance: '20000.000' },
      { name: 'Xe tải Lan', credit_balance: '20000.000' },
    ]);
    expect(await database.query('SELECT source, credits, note, balance_after, added_by FROM credit_additions')).toEqual([
      { source: 'starting_grant', credits: '20000.000', note: 'Credit ban đầu', balance_after: '20000.000', added_by: null },
      { source: 'starting_grant', credits: '20000.000', note: 'Credit ban đầu', balance_after: '20000.000', added_by: null },
    ]);
  });
});
