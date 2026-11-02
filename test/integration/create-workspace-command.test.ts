import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCreateWorkspaceCommand } from '../../src/bootstrap/create-workspace.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

describe('the create-workspace command', () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createMigratedDatabase();
  });

  afterEach(async () => {
    await database.drop();
  });

  it('creates the workspace', async () => {
    const exitCode = await runCommand(['Xe tải Duy Khương', 'Duy']);

    expect(exitCode).toBe(0);
    expect(await database.query('SELECT name FROM workspaces')).toEqual([
      { name: 'Xe tải Duy Khương' },
    ]);
  });

  async function runCommand(args: string[]): Promise<number> {
    return runCreateWorkspaceCommand(args, { DATABASE_URL: database.url }, { log: () => {} });
  }
});
