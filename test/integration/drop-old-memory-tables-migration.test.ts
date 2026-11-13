import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

describe('the migration that drops the old memory tables', () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createMigratedDatabase();
  });

  afterEach(async () => {
    await database.drop();
  });

  it('leaves neither the old private memory table nor the old member memory table', async () => {
    const tables = await database.query(`SELECT to_regclass('user_memories') AS user_memories, to_regclass('member_memories') AS member_memories`);

    expect(tables).toEqual([{ user_memories: null, member_memories: null }]);
  });
});
