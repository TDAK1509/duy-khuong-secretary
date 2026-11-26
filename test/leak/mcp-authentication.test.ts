import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { hashSecretToken } from '../../src/app/internal/admin/secret-token.ts';
import { authenticateMcpRequest } from '../../src/app/internal/mcp/authenticate-mcp-request.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { resetDatabase } from './support/reset-database.ts';
import { A_ADMIN_USER_ID, FIXED_NOW } from './support/seed-ids.ts';

const SESSION_TOKEN = 'SAFE-A-SESSION-TOKEN';
const ONE_HOUR_MS = 3_600_000;
const EXPIRES_AT = new Date(FIXED_NOW.getTime() + ONE_HOUR_MS);

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test('the MCP server refuses the session of a workspace admin who is not internal', async () => {
  await databases.owner.query('INSERT INTO internal_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
    hashSecretToken(SESSION_TOKEN),
    A_ADMIN_USER_ID,
    EXPIRES_AT,
  ]);
  const result = await authenticateMcpRequest(databases.runtime, `Bearer ${SESSION_TOKEN}`, FIXED_NOW);
  assert.deepEqual(result, { kind: 'forbidden' });
});
