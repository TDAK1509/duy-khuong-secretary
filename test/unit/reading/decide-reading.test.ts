import { describe, expect, it, vi } from 'vitest';
import { decideReading } from '../../../src/app/reading/decide-reading.ts';
import type { Reading } from '../../../src/app/reading/reading.ts';
import type { ReaderRequest } from '../../../src/services/reading/reader-service.ts';
import { makeReaderReturning } from '../../fakes/fake-reader.ts';
import { makeItem, makeReading } from './make-reading.ts';

const REQUEST: ReaderRequest = {
  system: 'system prompt',
  text: null,
  image: null,
  schemaName: 'work_message_reading',
  schema: {},
};

const FUEL_READING = makeReading([makeItem()]);
const OTHER_AMOUNT_READING = makeReading([makeItem({ amount_vnd: 1520000 })]);

function makeSlots(readings: { cheap: [Reading, Reading]; strong: [Reading, Reading] }) {
  return {
    cheap: [makeReaderReturning('cheap-1', readings.cheap[0]), makeReaderReturning('cheap-2', readings.cheap[1])],
    strong: [makeReaderReturning('strong-1', readings.strong[0]), makeReaderReturning('strong-2', readings.strong[1])],
  } as const;
}

describe('decideReading', () => {
  it('gives the cheap-pair result when the cheap readers agree', async () => {
    const slots = makeSlots({ cheap: [FUEL_READING, FUEL_READING], strong: [FUEL_READING, FUEL_READING] });

    const decision = await decideReading(slots, REQUEST);

    expect(decision.outcome).toBe('cheap_pair');
  });

  it('never calls the strong readers when the cheap readers agree', async () => {
    const slots = makeSlots({ cheap: [FUEL_READING, FUEL_READING], strong: [FUEL_READING, FUEL_READING] });

    await decideReading(slots, REQUEST);

    expect(slots.strong.flatMap((reader) => reader.requests)).toEqual([]);
  });

  it('escalates to an agreeing strong pair when the cheap readers disagree', async () => {
    const slots = makeSlots({
      cheap: [FUEL_READING, OTHER_AMOUNT_READING],
      strong: [FUEL_READING, FUEL_READING],
    });

    const decision = await decideReading(slots, REQUEST);

    expect(decision.outcome).toBe('expensive_pair');
  });

  it('gives an unresolved result when both pairs disagree', async () => {
    const slots = makeSlots({
      cheap: [FUEL_READING, OTHER_AMOUNT_READING],
      strong: [FUEL_READING, OTHER_AMOUNT_READING],
    });

    const decision = await decideReading(slots, REQUEST);

    expect(decision.outcome).toBe('unresolved');
  });

  it('logs the fields each pair disagrees on, without their values', async () => {
    const logged = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const slots = makeSlots({
      cheap: [FUEL_READING, OTHER_AMOUNT_READING],
      strong: [FUEL_READING, OTHER_AMOUNT_READING],
    });

    await decideReading(slots, REQUEST);

    expect(logged.mock.calls).toEqual([
      ['[reading] cheap readers disagree on: amount_vnd'],
      ['[reading] strong readers disagree on: amount_vnd'],
    ]);
    logged.mockRestore();
  });
});
