import { after, beforeEach, test } from 'node:test';
import type { PostgresPool } from '../../src/providers/database/postgres.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { assertNoLeak } from './support/leak-check.ts';
import { READ_ATTACK_CASES } from './support/read-attack-cases.ts';
import { resetDatabase } from './support/reset-database.ts';
import { runAttackCase } from './support/run-attack-case.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test('read tools with B arguments return no B data under the runtime role', () => assertReadToolsKeepWorkspaceBOut(databases.runtime));

async function assertReadToolsKeepWorkspaceBOut(database: PostgresPool): Promise<void> {
  for (const attackCase of READ_ATTACK_CASES) {
    const outcome = await runAttackCase({ owner: databases.owner, database, attackCase, path: 'chat-gate' });
    assertNoLeak(outcome.observations, { passedIds: outcome.passedIds, label: attackCase.name });
  }
}
