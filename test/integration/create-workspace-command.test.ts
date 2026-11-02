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

  it('creates one admin invite for that workspace', async () => {
    await runCommand(['Xe tải Duy Khương', 'Duy']);

    expect(
      await database.query(`
        SELECT w.name AS workspace_name, i.display_name, i.role, i.created_by, i.used_at
        FROM workspace_invites i JOIN workspaces w ON w.id = i.workspace_id
      `),
    ).toEqual([
      {
        workspace_name: 'Xe tải Duy Khương',
        display_name: 'Duy',
        role: 'admin',
        created_by: null,
        used_at: null,
      },
    ]);
  });

  async function runCommand(args: string[]): Promise<number> {
    return runCreateWorkspaceCommand(args, { DATABASE_URL: database.url }, { log: () => {} });
  }
});
