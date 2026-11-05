import { FakeReader } from './fake-reader.ts';

export const NO_WORK_DATA = { has_work_data: false, needs_explanation: false, has_question: false, items: [] };

export type FakeReaderSlots = {
  cheap: readonly [FakeReader, FakeReader];
  strong: readonly [FakeReader, FakeReader];
};

export function createFakeReaderSlots(): FakeReaderSlots {
  const makeReader = (label: string) => new FakeReader(label, () => ({ ok: true, json: NO_WORK_DATA }));
  return {
    cheap: [makeReader('cheap-1'), makeReader('cheap-2')],
    strong: [makeReader('strong-1'), makeReader('strong-2')],
  };
}
