import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

describe('the users table for the runtime role', () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createMigratedDatabase();
  });

  afterEach(async () => {
    await database.drop();
  });

  it('inserts a new user who is not internal', async () => {
    const runtime = await database.openRuntimeSession();

    await runtime.query('INSERT INTO users DEFAULT VALUES');

    expect(await database.query('SELECT is_internal FROM users')).toEqual([{ is_internal: false }]);
  });
});
