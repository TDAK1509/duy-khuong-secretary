import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIVE_ATTACK_CASES } from './live/live-attack-cases.ts';

const EXPECTED_CASE_IDS = ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09', 'E10'];

test('the live attack case list is complete and safe to commit', () => {
  assert.deepEqual(LIVE_ATTACK_CASES.map(({ id }) => id), EXPECTED_CASE_IDS);
  const turnTexts = LIVE_ATTACK_CASES.flatMap(({ turns }) => turns);
  assert.deepEqual(turnTexts.filter((text) => text.includes('LEAK-B-')), []);
});
