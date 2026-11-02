import { execFile, execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { listAppliedMigrations } from './list-applied-migrations.ts';
import { createTemporaryDatabase, type TemporaryDatabase } from './temporary-database.ts';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const migrationNames = readdirSync(new URL('../../src/app/db/migrations/', import.meta.url))
  .map((file) => file.replace(/\.ts$/, ''))
  .sort();

describe('the built migration entry', () => {
  let database: TemporaryDatabase;

  beforeAll(() => {
    execFileSync('npm', ['run', 'build'], { cwd: repositoryRoot, stdio: 'ignore' });
  }, 120_000);

  beforeEach(async () => {
    database = await createTemporaryDatabase();
  });

  afterEach(async () => {
    await database.drop();
  });

  it('applies every migration to an empty database', async () => {
    const run = promisify(execFile)('node', ['dist/bootstrap/migrate.js'], {
      cwd: repositoryRoot,
      env: { ...process.env, MIGRATION_DATABASE_URL: database.url },
    });

    await expect(run).resolves.toMatchObject({
      stdout: `[migrate] applied: ${migrationNames.join(', ')}\n`,
    });
    expect(await listAppliedMigrations(database)).toEqual(migrationNames);
  });
});
