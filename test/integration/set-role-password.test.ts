import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readRuntimeDatabaseUrl } from '../../src/bootstrap/config.ts';
import { setRolePassword } from '../../src/providers/database/set-role-password.ts';
import { superuserDatabaseUrl } from './test-database-url.ts';

const CREATOR_PASSWORD = 'creator-pass';
const PASSWORD_WITH_SYMBOLS = 'ab+cd/ef==';

describe('setRolePassword', () => {
  let creator: string;
  let target: string;

  beforeEach(async () => {
    const suffix = randomUUID().replaceAll('-', '');
    creator = `creator_${suffix}`;
    target = `target_${suffix}`;
    await asSuperuser(`CREATE ROLE ${creator} LOGIN CREATEROLE PASSWORD '${CREATOR_PASSWORD}'`);
    await runAs(signInAs(superuserDatabaseUrl, creator, CREATOR_PASSWORD), `CREATE ROLE ${target} LOGIN`);
  });

  afterEach(async () => {
    await asSuperuser(`DROP ROLE ${target}`);
    await asSuperuser(`DROP ROLE ${creator}`);
  });

  it("lets the role's creator set its password, and the derived URL signs in as that role", async () => {
    const creatorUrl = signInAs(superuserDatabaseUrl, creator, CREATOR_PASSWORD);

    await setRolePassword({ databaseUrl: creatorUrl, role: target, password: PASSWORD_WITH_SYMBOLS });

    const derivedUrl = readRuntimeDatabaseUrl({
      MIGRATION_DATABASE_URL: creatorUrl,
      APP_RUNTIME_PASSWORD: PASSWORD_WITH_SYMBOLS,
    });
    const url = new URL(derivedUrl ?? '');
    url.username = target;
    expect(await selectCurrentUser(url.toString())).toBe(target);
  });
});

function signInAs(databaseUrl: string, role: string, password: string): string {
  const url = new URL(databaseUrl);
  url.username = role;
  url.password = password;
  return url.toString();
}

async function asSuperuser(statement: string): Promise<void> {
  await runAs(superuserDatabaseUrl, statement);
}

async function runAs(databaseUrl: string, statement: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

async function selectCurrentUser(databaseUrl: string): Promise<string> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ current_user: string }>('SELECT current_user');
    return result.rows[0]?.current_user ?? '';
  } finally {
    await client.end();
  }
}
