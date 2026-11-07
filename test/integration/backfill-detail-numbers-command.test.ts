import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runBackfillDetailNumbersCommand } from '../../src/bootstrap/backfill-detail-numbers.ts';
import { FakeReader } from '../fakes/fake-reader.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertRecordRow } from './record-rows.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';
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

  it('prints the usage when the workspace id is missing', async () => {
    const lines: string[] = [];

    const exitCode = await runBackfillDetailNumbersCommand([], { DATABASE_URL: database.runtimeUrl }, { log: (line) => lines.push(line) });

    expect(exitCode).toBe(1);
    expect(lines).toEqual(['Usage: node dist/bootstrap/backfill-detail-numbers.js <workspace-uuid> [--apply]']);
  });

  it('stops when the reader settings are missing', async () => {
    const lines: string[] = [];

    const exitCode = await runBackfillDetailNumbersCommand(
      [SOME_WORKSPACE_ID, '--apply'],
      { DATABASE_URL: database.runtimeUrl },
      { log: (line) => lines.push(line) },
    );

    expect(exitCode).toBe(1);
    expect(lines).toEqual(['Missing reader settings: READER_PROVIDER, READER_API_KEY']);
  });

  it('counts the records without numbers and changes nothing in a dry run', async () => {
    const workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const userId = await insertMember(database, { workspaceId, externalUserId: 'zalo-1', displayName: 'Duy' });
    const details = [{ label: 'Trọng lượng hàng', value: '27,420 Kg' }];
    await insertRecordRow(database, { workspaceId, userId, senderName: 'Duy', details });
    await insertRecordRow(database, { workspaceId, userId, senderName: 'Duy', details });
    const reader = new FakeReader();
    const lines: string[] = [];

    const exitCode = await runBackfillDetailNumbersCommand(
      [workspaceId],
      { DATABASE_URL: database.runtimeUrl, READER_PROVIDER: 'openai-compatible', READER_API_KEY: 'key' },
      { log: (line) => lines.push(line), buildReader: () => reader },
    );

    expect(exitCode).toBe(0);
    expect(lines).toEqual([
      `Records without numbers in workspace ${workspaceId}: 2. Nothing changed. Run again with --apply to add numbers.`,
    ]);
    expect(await database.query('SELECT details FROM records')).toEqual([{ details }, { details }]);
    expect(reader.requests).toEqual([]);
  });
});
