import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const ADMIN_USER = 'zu-admin';

describe('parsing a stored admin sheet', () => {
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

  it('queues a headers-found reply after a .csv with three data rows is parsed', async () => {
    await uploadCsv(harness, 'orders.csv', 'name,plate,date\nA,51A,2026-01-01\nB,51B,2026-01-02\nC,51C,2026-01-03\n');

    await harness.runParseFiles();

    const replies = await database.query<{ body: string }>(
      `SELECT body FROM outbound_messages WHERE external_user_id = '${ADMIN_USER}' ORDER BY created_at`,
    );
    expect(replies.map((row) => row.body)).toEqual([
      'Đã nhận file "orders.csv" (1 KB).',
      'File "orders.csv" có 3 dòng dữ liệu với các cột: name, plate, date.',
    ]);
    expect(await database.query('SELECT (parsed_at IS NOT NULL) AS parsed FROM message_files')).toEqual([
      { parsed: true },
    ]);
  });

  it('queues a parse-failure reply after a broken .xlsx cannot be read', async () => {
    const bytes = new Uint8Array(50).fill(0x30);
    bytes.set([0x50, 0x4b, 0x03, 0x04]);
    const fileUrl = 'https://zdn.vn/broken.xlsx';
    harness.channel.attachments.set(fileUrl, { ok: true, bytes });
    await harness.receiveFile(ADMIN_USER, { fileUrl, fileName: 'broken.xlsx', fileSize: bytes.length });

    await harness.runParseFiles();

    const replies = await database.query<{ body: string }>(
      `SELECT body FROM outbound_messages WHERE external_user_id = '${ADMIN_USER}' ORDER BY created_at`,
    );
    expect(replies.map((row) => row.body)).toEqual([
      'Đã nhận file "broken.xlsx" (1 KB).',
      'File "broken.xlsx" không đọc được. Kiểm tra định dạng và gửi lại.',
    ]);
    expect(await database.query('SELECT (parsed_at IS NOT NULL) AS parsed FROM message_files')).toEqual([
      { parsed: true },
    ]);
  });

  it('queues a no-data reply after an empty .csv is parsed', async () => {
    await uploadCsv(harness, 'empty.csv', '\n');

    await harness.runParseFiles();

    const replies = await database.query<{ body: string }>(
      `SELECT body FROM outbound_messages WHERE external_user_id = '${ADMIN_USER}' ORDER BY created_at`,
    );
    expect(replies.map((row) => row.body)).toEqual([
      'Đã nhận file "empty.csv" (1 KB).',
      'File "empty.csv" không có dòng dữ liệu.',
    ]);
    expect(await database.query('SELECT (parsed_at IS NOT NULL) AS parsed FROM message_files')).toEqual([
      { parsed: true },
    ]);
  });
});

async function uploadCsv(harness: IntakeHarness, fileName: string, text: string): Promise<void> {
  const bytes = new TextEncoder().encode(text);
  const fileUrl = `https://zdn.vn/${fileName}`;
  harness.channel.attachments.set(fileUrl, { ok: true, bytes });
  await harness.receiveFile(ADMIN_USER, { fileUrl, fileName, fileSize: bytes.length });
}
