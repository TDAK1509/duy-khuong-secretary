import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const INSUFFICIENT_PRIVILEGE = '42501';

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

  it('cannot make a user internal', async () => {
    await database.query('INSERT INTO users DEFAULT VALUES');
    const runtime = await database.openRuntimeSession();

    const update = runtime.query('UPDATE users SET is_internal = true');

    await expect(update).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
  });
});
