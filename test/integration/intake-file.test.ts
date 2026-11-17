import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const ADMIN_USER = 'zu-admin';
const CSV_HEADER = 'name,plate,date';

describe('an admin uploads a sheet file', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId } = harness);
    await insertMember(database, { workspaceId, externalUserId: ADMIN_USER, displayName: 'Admin', role: 'admin' });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('downloads an admin .csv, stores it, and inserts the message_files row', async () => {
    harness.channel.attachments.set('https://zdn.vn/orders.csv', { ok: true, bytes: makeCsv(20480) });

    await harness.receiveFile(ADMIN_USER, {
      fileUrl: 'https://zdn.vn/orders.csv',
      fileName: 'orders.csv',
      fileSize: 20480,
    });

    const messages = await database.query<{ id: string; text: string; image_key: string | null }>(
      `SELECT id, text, image_key FROM messages WHERE author = 'user'`,
    );
    expect(messages).toEqual([{ id: messages[0]?.id, text: 'orders.csv', image_key: null }]);
    expect(harness.fileStorage.listKeys()).toEqual([`${workspaceId}/${messages[0]?.id}.csv`]);
    expect(
      await database.query(`SELECT message_id, file_name, file_size_bytes, extension FROM message_files`),
    ).toEqual([
      { message_id: messages[0]?.id, file_name: 'orders.csv', file_size_bytes: 20480, extension: 'csv' },
    ]);
  });

  it('refuses a file over 5 MB without storing it', async () => {
    await harness.receiveFile(ADMIN_USER, {
      fileUrl: 'https://zdn.vn/big.csv',
      fileName: 'big.csv',
      fileSize: 6 * 1024 * 1024,
    });

    expect(harness.fileStorage.listKeys()).toEqual([]);
    expect(await database.query('SELECT count(*)::int AS c FROM message_files')).toEqual([{ c: 0 }]);
    expect(await database.query(`SELECT body FROM outbound_messages WHERE external_user_id = '${ADMIN_USER}'`)).toEqual([
      { body: 'File quá lớn, tối đa 5 MB.' },
    ]);
  });
});

function makeCsv(size: number, header: string = CSV_HEADER): Uint8Array {
  const prefix = new TextEncoder().encode(header);
  const bytes = new Uint8Array(size).fill(0x20);
  bytes.set(prefix);
  return bytes;
}
