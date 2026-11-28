import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pairDropOffsByRule, readPairingTimes, type PairingPaper, type PairingRow } from '../../src/app/trips/pair-drop-offs-by-rule.ts';

test('a one-character plate difference pairs when the pickup has the equal-weight outcome', () => {
  const { pairs } = pairDropOffsByRule([buildPickup()], [buildDropOff('drop-off', '51C12346', 27080)]);
  assert.deepEqual([...pairs], [['pickup', 'drop-off']]);
});

function buildPickup(overrides: Partial<PairingRow> = {}): PairingRow {
  return { id: 'pickup', plate: '51C12345', times: readPairingTimes('2026-03-05', null), weightKg: 27080, isPossibleDuplicate: false, hasEqualWeightEntry: true, ...overrides };
}

function buildDropOff(id: string, plate: string, weightKg: number): PairingPaper {
  return { id, plate, times: readPairingTimes('2026-03-06', null), weightKg };
}
