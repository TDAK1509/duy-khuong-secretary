import { describe, expect, it } from 'vitest';
import { decideReading } from '../../../src/app/reading/decide-reading.ts';
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

describe('decideReading', () => {
  it('gives the cheap-pair result when the cheap readers agree', async () => {
    const slots = {
      cheap: [makeReaderReturning('cheap-1', FUEL_READING), makeReaderReturning('cheap-2', FUEL_READING)],
      strong: [makeReaderReturning('strong-1', FUEL_READING), makeReaderReturning('strong-2', FUEL_READING)],
    } as const;

    const decision = await decideReading(slots, REQUEST);

    expect(decision.outcome).toBe('cheap_pair');
  });
});
