import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  runCreateWorkspaceCommand,
  type CreateWorkspaceOptions,
} from '../../src/bootstrap/create-workspace.ts';
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

  it('makes the invite expire 7 days after creation', async () => {
    const lines: string[] = [];

    await runCommand(['Xe tải Duy Khương', 'Duy'], {
      log: (line) => lines.push(line),
      now: () => new Date('2026-11-02T10:00:00+07:00'),
    });

    expect(await database.query('SELECT expires_at FROM workspace_invites')).toEqual([
      { expires_at: new Date('2026-11-09T10:00:00+07:00') },
    ]);
    expect(lines[1]).toContain('(valid until 10:00 09/11/2026)');
  });

  it('stores the hash of the printed code and not the code', async () => {
    const lines: string[] = [];

    await runCommand(['Xe tải Duy Khương', 'Duy'], { log: (line) => lines.push(line) });

    const printedCode = /MOI-[A-Z0-9]{6}/.exec(lines.join('\n'))?.[0] ?? '';
    const [invite] = await database.query<Record<string, unknown>>(
      'SELECT * FROM workspace_invites',
    );
    expect(printedCode).not.toBe('');
    expect(invite?.['code_hash']).toBe(
      createHash('sha256').update(printedCode.replace('-', '')).digest('hex'),
    );
    expect(JSON.stringify(invite)).not.toContain(printedCode.slice(4));
  });

  it('creates nothing when the workspace name is only spaces', async () => {
    const lines: string[] = [];

    await runCommand(['   ', 'Duy'], { log: (line) => lines.push(line) });

    expect(lines).toEqual(['Invalid workspace name.']);
    expect(await countAllRows()).toBe(0);
  });

  async function countAllRows(): Promise<number> {
    const tables = ['users', 'workspaces', 'memberships', 'workspace_invites'];
    const counts = await Promise.all(
      tables.map((table) => database.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`)),
    );
    return counts.reduce((total, [row]) => total + Number(row?.n), 0);
  }

  async function runCommand(
    args: string[],
    options: CreateWorkspaceOptions = { log: () => {} },
  ): Promise<number> {
    return runCreateWorkspaceCommand(args, { DATABASE_URL: database.url }, options);
  }
});
