import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

describe('the index on outbound messages that are sending', () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createMigratedDatabase();
  });

  afterEach(async () => {
    await database.drop();
  });

  it('indexes locked_until for the rows in sending status', async () => {
    const [index] = await database.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'outbound_messages_sending_idx'`,
    );

    expect(index?.indexdef).toContain('(locked_until)');
    expect(index?.indexdef).toContain(`WHERE (status = 'sending'::text)`);
  });
});
