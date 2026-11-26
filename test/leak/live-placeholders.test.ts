import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { fillPlaceholders } from './live/fill-placeholders.ts';
import { LIVE_ATTACK_CASES } from './live/live-attack-cases.ts';
import { readSeedPlaceholders } from './live/read-seed-placeholders.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { resetDatabase } from './support/reset-database.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test('every placeholder in every live turn resolves from the seed', async () => {
  const values = await readSeedPlaceholders(databases.owner);
  const filledTurns = LIVE_ATTACK_CASES.flatMap(({ turns }) => turns).map((turn) => fillPlaceholders(turn, values));
  assert.deepEqual(filledTurns.filter((turn) => /\{[^}]*\}/.test(turn)), []);
});
