import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertWorkspace } from './workspace-rows.ts';

const INSUFFICIENT_PRIVILEGE = '42501';

describe('the credit tables for the runtime role', () => {
  let database: TemporaryDatabase;
  let workspaceId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
  });

  afterEach(async () => {
    await database.drop();
  });

  it('cannot change a recorded call', async () => {
    await database.query(
      `INSERT INTO llm_calls (workspace_id, kind, model, cost_usd, credits) VALUES ('${workspaceId}', 'photo_read', 'gpt-6.1-sol', 0, 0)`,
    );
    const runtime = await database.openRuntimeSession();

    const update = runtime.query(`UPDATE llm_calls SET credits = 1`);

    await expect(update).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
  });

  it('cannot delete a credit addition', async () => {
    await database.query(
      `INSERT INTO credit_additions (workspace_id, credits, source, note, balance_after) VALUES ('${workspaceId}', 100, 'starting_grant', 'Credit ban đầu', 100)`,
    );
    const runtime = await database.openRuntimeSession();

    const remove = runtime.query(`DELETE FROM credit_additions`);

    await expect(remove).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
  });
});
