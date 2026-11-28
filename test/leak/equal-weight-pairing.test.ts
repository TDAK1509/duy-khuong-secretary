import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pairDropOffsByRule, readPairingTimes, type PairingPaper, type PairingRow } from '../../src/app/trips/pair-drop-offs-by-rule.ts';

test('a one-character plate difference pairs when the pickup has the equal-weight outcome', () => {
  const { pairs } = pairDropOffsByRule([buildPickup()], [buildDropOff('drop-off', '51C12346', 27080)]);
  assert.deepEqual([...pairs], [['pickup', 'drop-off']]);
});

test('without the equal-weight outcome the same papers stay apart', () => {
  const { pairs } = pairDropOffsByRule([buildPickup({ hasEqualWeightEntry: false })], [buildDropOff('drop-off', '51C12346', 27080)]);
  assert.equal(pairs.size, 0);
});

test('a one-character plate difference with a 20 kg difference stays apart', () => {
  const { pairs } = pairDropOffsByRule([buildPickup()], [buildDropOff('drop-off', '51C12346', 27100)]);
  assert.equal(pairs.size, 0);
});

test('a two-character plate difference stays apart', () => {
  const { pairs } = pairDropOffsByRule([buildPickup()], [buildDropOff('drop-off', '51C12399', 27080)]);
  assert.equal(pairs.size, 0);
});

test('two equal candidates leave the pickup unpaired', () => {
  const { pairs } = pairDropOffsByRule([buildPickup()], [buildDropOff('first', '51C12346', 27080), buildDropOff('second', '51C12347', 27080)]);
  assert.equal(pairs.size, 0);
});

function buildPickup(overrides: Partial<PairingRow> = {}): PairingRow {
  return { id: 'pickup', plate: '51C12345', times: readPairingTimes('2026-03-05', null), weightKg: 27080, isPossibleDuplicate: false, hasEqualWeightEntry: true, ...overrides };
}

function buildDropOff(id: string, plate: string, weightKg: number): PairingPaper {
  return { id, plate, times: readPairingTimes('2026-03-06', null), weightKg };
}
