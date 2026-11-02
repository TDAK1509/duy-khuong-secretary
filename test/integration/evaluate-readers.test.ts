import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { evaluateReaders } from '../../src/app/reading/evaluate-readers.ts';
import type { ReaderSlots } from '../../src/app/reading/decide-reading.ts';
import type { Reading } from '../../src/app/reading/reading.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { FakeReader } from '../fakes/fake-reader.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';

const AGREED_FUEL = makeReading([makeItem({ amount_vnd: 1250000, occurred_on: '2026-10-30' })]);
const OTHER_AMOUNT_FUEL = makeReading([makeItem({ amount_vnd: 1520000, occurred_on: '2026-10-30' })]);

const FIRST_PHOTO_BYTE = 1;
const SECOND_PHOTO_BYTE = 2;

describe('evaluateReaders', () => {
  const folders: string[] = [];

  afterEach(async () => {
    await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
  });

  async function makePhotoFolder(files: Record<string, number>, expected?: unknown): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), 'evaluate-readers-'));
    folders.push(folder);
    for (const [name, byte] of Object.entries(files)) await writeFile(join(folder, name), new Uint8Array([byte]));
    if (expected !== undefined) await writeFile(join(folder, 'expected.json'), JSON.stringify(expected));
    return folder;
  }

  function makeReaderPerPhoto(label: string, readings: Record<number, Reading>): FakeReader {
    return new FakeReader(label, (request) => ({ ok: true, json: readings[request.image?.bytes[0] ?? 0] }));
  }

  async function runCommand(folderPath: string, slots: ReaderSlots): Promise<string> {
    const lines: string[] = [];
    const clock = new FakeClock(new Date('2026-10-31T03:00:00Z'));
    await evaluateReaders({ folderPath, slots, clock, print: (line) => lines.push(line) });
    return lines.join('\n');
  }

  function makeAgreeingSlots(readings: Record<number, Reading>): ReaderSlots {
    const makeReader = (label: string) => makeReaderPerPhoto(label, readings);
    return { cheap: [makeReader('cheap-1'), makeReader('cheap-2')], strong: [makeReader('strong-1'), makeReader('strong-2')] };
  }

  it('prints the escalation rate', async () => {
    const folder = await makePhotoFolder({ 'a.jpg': FIRST_PHOTO_BYTE, 'b.jpg': SECOND_PHOTO_BYTE });
    const slots = {
      cheap: [
        makeReaderPerPhoto('cheap-1', { [FIRST_PHOTO_BYTE]: AGREED_FUEL, [SECOND_PHOTO_BYTE]: AGREED_FUEL }),
        makeReaderPerPhoto('cheap-2', { [FIRST_PHOTO_BYTE]: AGREED_FUEL, [SECOND_PHOTO_BYTE]: OTHER_AMOUNT_FUEL }),
      ],
      strong: [
        makeReaderPerPhoto('strong-1', { [SECOND_PHOTO_BYTE]: AGREED_FUEL }),
        makeReaderPerPhoto('strong-2', { [SECOND_PHOTO_BYTE]: AGREED_FUEL }),
      ],
    } as const;

    const output = await runCommand(folder, slots);

    expect(output).toContain('escalation rate: 50%');
  });

  it('compares amounts with expected.json', async () => {
    const expected = {
      'a.jpg': { amount_vnd: 1250000, occurred_on: '2026-10-30' },
      'b.jpg': { amount_vnd: 999, occurred_on: '2026-10-30' },
    };
    const folder = await makePhotoFolder({ 'a.jpg': FIRST_PHOTO_BYTE, 'b.jpg': SECOND_PHOTO_BYTE }, expected);
    const slots = makeAgreeingSlots({ [FIRST_PHOTO_BYTE]: AGREED_FUEL, [SECOND_PHOTO_BYTE]: AGREED_FUEL });

    const output = await runCommand(folder, slots);

    expect(output).toContain('amounts correct: 1/2');
  });

  it('compares dates with expected.json', async () => {
    const expected = {
      'a.jpg': { amount_vnd: 1250000, occurred_on: '2026-10-30' },
      'b.jpg': { amount_vnd: 1250000, occurred_on: '2026-10-29' },
    };
    const folder = await makePhotoFolder({ 'a.jpg': FIRST_PHOTO_BYTE, 'b.jpg': SECOND_PHOTO_BYTE }, expected);
    const slots = makeAgreeingSlots({ [FIRST_PHOTO_BYTE]: AGREED_FUEL, [SECOND_PHOTO_BYTE]: AGREED_FUEL });

    const output = await runCommand(folder, slots);

    expect(output).toContain('dates correct: 1/2');
  });

  it('counts a photo without an agreement as incorrect', async () => {
    const expected = { 'a.jpg': { amount_vnd: 1250000, occurred_on: '2026-10-30' } };
    const folder = await makePhotoFolder({ 'a.jpg': FIRST_PHOTO_BYTE }, expected);
    const makeReader = (label: string, amount: number) =>
      makeReaderPerPhoto(label, { [FIRST_PHOTO_BYTE]: makeReading([makeItem({ amount_vnd: amount })]) });
    const slots = {
      cheap: [makeReader('cheap-1', 1), makeReader('cheap-2', 2)],
      strong: [makeReader('strong-1', 3), makeReader('strong-2', 4)],
    } as const;

    const output = await runCommand(folder, slots);

    expect(output).toContain('unresolved: 1');
    expect(output).toContain('amounts correct: 0/1');
  });

  it('prints the share of detail pairs both readers returned', async () => {
    const folder = await makePhotoFolder({ 'a.jpg': FIRST_PHOTO_BYTE });
    const details = [{ label: 'Số lít', value: '50' }, { label: 'Trạm', value: 'Long Biên' }];
    const withTwoDetails = makeReading([makeItem({ details })]);
    const withOneDetail = makeReading([makeItem({ details: details.slice(0, 1) })]);
    const slots = {
      cheap: [
        makeReaderPerPhoto('cheap-1', { [FIRST_PHOTO_BYTE]: withTwoDetails }),
        makeReaderPerPhoto('cheap-2', { [FIRST_PHOTO_BYTE]: withOneDetail }),
      ],
      strong: [makeReaderPerPhoto('strong-1', {}), makeReaderPerPhoto('strong-2', {})],
    } as const;

    const output = await runCommand(folder, slots);

    expect(output).toContain('details agreement: 50%');
  });

  it('prints each reading, whether the pair agrees and the outcome per photo', async () => {
    const folder = await makePhotoFolder({ 'a.jpg': FIRST_PHOTO_BYTE });
    const slots = makeAgreeingSlots({ [FIRST_PHOTO_BYTE]: AGREED_FUEL });

    const output = await runCommand(folder, slots);

    expect(output).toContain('a.jpg');
    expect(output).toContain(`cheap-1: ${JSON.stringify(AGREED_FUEL)}`);
    expect(output).toContain('cheap pair agrees: yes');
    expect(output).toContain('outcome: cheap_pair');
  });

  it('prints the failure reason of a read that failed', async () => {
    const folder = await makePhotoFolder({ 'a.jpg': FIRST_PHOTO_BYTE });
    const timedOut = new FakeReader('cheap-2', () => ({ ok: false, reason: 'timeout' }));
    const slots = {
      cheap: [makeReaderPerPhoto('cheap-1', { [FIRST_PHOTO_BYTE]: AGREED_FUEL }), timedOut],
      strong: [makeReaderPerPhoto('strong-1', {}), makeReaderPerPhoto('strong-2', {})],
    } as const;

    const output = await runCommand(folder, slots);

    expect(output).toContain('cheap-2: failed (timeout)');
    expect(output).toContain('cheap pair agrees: no');
  });

  it('refuses a photo over 5 MB without reading it', async () => {
    const folder = await makePhotoFolder({});
    await writeFile(join(folder, 'huge.jpg'), Buffer.alloc(5_000_001, FIRST_PHOTO_BYTE));
    const slots = makeAgreeingSlots({ [FIRST_PHOTO_BYTE]: AGREED_FUEL });

    const output = await runCommand(folder, slots);

    expect(output).toContain('huge.jpg: not read, larger than 5 MB (5000001 bytes)');
    expect(slots.cheap.flatMap((reader) => (reader as FakeReader).requests)).toEqual([]);
  });
});
