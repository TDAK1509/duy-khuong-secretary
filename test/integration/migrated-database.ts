import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type pg from 'pg';
import { runMigrationCommand } from '../../src/bootstrap/migrate.ts';
import { createTemporaryDatabase, runAs, type TemporaryDatabase } from './temporary-database.ts';
import { testDatabaseUrl } from './test-database-url.ts';

const migrationsDirectory = new URL('../../src/app/db/migrations/', import.meta.url);
const TEMPLATE_LOCK_KEY = 7_311_942;

let migratedTemplate: Promise<string> | undefined;

export async function createMigratedDatabase(creatorUrl?: string): Promise<TemporaryDatabase> {
  if (creatorUrl !== undefined) return migrateNewDatabase(creatorUrl);
  migratedTemplate ??= findOrCreateMigratedTemplate();
  return createTemporaryDatabase(testDatabaseUrl, await migratedTemplate);
}

async function migrateNewDatabase(creatorUrl: string): Promise<TemporaryDatabase> {
  const database = await createTemporaryDatabase(creatorUrl);
  const exitCode = await runMigrationCommand(
    { MIGRATION_DATABASE_URL: database.url },
    { directory: migrationsDirectory, log: () => {} },
  );
  if (exitCode !== 0) {
    await database.drop();
    throw new Error('the migrations failed on the temporary database');
  }
  return database;
}

async function findOrCreateMigratedTemplate(): Promise<string> {
  const template = `migrated_template_${await hashMigrations()}`;
  await runAs(testDatabaseUrl, async (client) => {
    await client.query('SELECT pg_advisory_lock($1)', [TEMPLATE_LOCK_KEY]);
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [template]);
    if (rowCount === 0) await createMigratedTemplate(client, template);
  });
  return template;
}

async function hashMigrations(): Promise<string> {
  const hash = createHash('sha256');
  for (const file of (await readdir(migrationsDirectory)).sort()) {
    hash.update(file);
    hash.update(await readFile(new URL(file, migrationsDirectory)));
  }
  return hash.digest('hex').slice(0, 16);
}

async function createMigratedTemplate(client: pg.Client, template: string): Promise<void> {
  const database = await migrateNewDatabase(testDatabaseUrl);
  const name = new URL(database.url).pathname.slice(1);
  await client.query(`ALTER DATABASE ${name} RENAME TO ${template}`);
  await client.query(`ALTER DATABASE ${template} IS_TEMPLATE true`);
}
