import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const CHECK_VIOLATION = '23514';

describe('the outbound messages table', () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createMigratedDatabase();
  });

  afterEach(async () => {
    await database.drop();
  });

  function insertRaw(columns: string, values: string): Promise<unknown> {
    return database.query(
      `INSERT INTO outbound_messages (channel, account_id, external_user_id, ${columns}) VALUES ('zalo-oa', 'oa-1', 'zu-hung', ${values})`,
    );
  }

  it('accepts an image with a text and an image without one', async () => {
    await insertRaw('kind, photo_key, body', `'image', 'w/1.jpg', 'Đã lưu'`);

    await expect(insertRaw('kind, photo_key', `'image', 'w/2.jpg'`)).resolves.toBeDefined();
  });

  it('refuses a text without a body', async () => {
    await expect(insertRaw('kind', `'text'`)).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('refuses a template with a body', async () => {
    await expect(insertRaw('kind, template_id, body', `'template', 't-1', 'Đã lưu'`)).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });
});
