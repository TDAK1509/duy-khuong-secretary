import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

describe('the migration that drops the ChatGPT tables', () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createMigratedDatabase();
  });

  afterEach(async () => {
    await database.drop();
  });

  it('leaves none of the three ChatGPT tables', async () => {
    const [tables] = await database.query<Record<string, string | null>>(
      `SELECT to_regclass('chatgpt_connections') AS connections,
              to_regclass('chatgpt_sign_ins') AS sign_ins,
              to_regclass('chatgpt_login_codes') AS login_codes`,
    );

    expect(tables).toEqual({ connections: null, sign_ins: null, login_codes: null });
  });
});
