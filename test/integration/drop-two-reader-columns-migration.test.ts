import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

describe('the migration that drops the two-reader columns', () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createMigratedDatabase();
  });

  afterEach(async () => {
    await database.drop();
  });

  it('leaves the records table without read_by', async () => {
    expect(await listColumns('records')).not.toContain('read_by');
  });

  it('leaves the messages table without code_choice', async () => {
    expect(await listColumns('messages')).not.toContain('code_choice');
  });

  async function listColumns(tableName: string): Promise<string[]> {
    const rows = await database.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName}'`,
    );
    return rows.map((row) => row.column_name);
  }
});
