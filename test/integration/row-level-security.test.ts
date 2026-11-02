import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertRecordRow } from './record-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('row-level security for the runtime role', () => {
  let database: TemporaryDatabase;
  let workspaceId: string;
  let hungUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
  });

  afterEach(async () => {
    await database.drop();
  });

  it('hides records when no scope is set', async () => {
    for (let index = 0; index < 3; index += 1) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' });
    }
    const session = await database.openRuntimeSession();

    const { rows } = await session.query('SELECT id FROM records');

    expect(rows).toHaveLength(0);
  });
});
