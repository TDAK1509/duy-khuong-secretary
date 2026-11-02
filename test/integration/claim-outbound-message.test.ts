import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { claimOutboundMessage } from '../../src/app/delivery/claim-outbound-message.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertOutboundMessage } from './outbound-message-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const CLAIMERS = 8;

describe('claimOutboundMessage', () => {
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

  it('lets only one of many simultaneous claims through when the limit is one', async () => {
    for (let person = 1; person <= CLAIMERS; person += 1) {
      await insertOutboundMessage(database, { externalUserId: `zu-${person}` });
    }

    const claims = await Promise.all(Array.from({ length: CLAIMERS }, () => claimOutboundMessage(pool, NOW, 1)));

    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
  });
});
