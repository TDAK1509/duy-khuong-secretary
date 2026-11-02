import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enqueueText } from '../../src/app/delivery/enqueue-text.ts';
import { runInTransaction } from '../../src/app/db/transaction.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const HUNG = { channel: 'zalo-oa', accountId: 'oa-1', externalUserId: 'zu-hung' };
const AVAILABLE_AT = new Date('2026-11-02T10:00:00+07:00');

describe('enqueueText', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('queues one text row per part, in order', async () => {
    const text = `${'a'.repeat(1800)}\n${'b'.repeat(699)}`;

    await runInTransaction(pool, (transaction) =>
      enqueueText(transaction, { to: HUNG, text, maxTextLength: 2000, availableAt: AVAILABLE_AT }),
    );

    const rows = await database.query('SELECT kind, status, length(body) AS length FROM outbound_messages ORDER BY seq');
    expect(rows).toEqual([
      { kind: 'text', status: 'queued', length: 1800 },
      { kind: 'text', status: 'queued', length: 699 },
    ]);
  });
});
