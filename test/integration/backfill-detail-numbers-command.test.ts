import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runBackfillDetailNumbersCommand } from '../../src/bootstrap/backfill-detail-numbers.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const SOME_WORKSPACE_ID = '5d1f3c1e-6a1f-4a0b-9d0e-1c2b3a4d5e6f';

describe('the backfill-detail-numbers command', () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createMigratedDatabase();
  });

  afterEach(async () => {
    await database.drop();
  });

  it('stops when the database URL is missing', async () => {
    const lines: string[] = [];

    const exitCode = await runBackfillDetailNumbersCommand([SOME_WORKSPACE_ID], {}, { log: (line) => lines.push(line) });

    expect(exitCode).toBe(1);
    expect(lines).toEqual(['DATABASE_URL must be set to a database URL']);
  });
});
