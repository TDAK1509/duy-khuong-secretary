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

  async function makePhotoFolder(files: Record<string, number>): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), 'evaluate-readers-'));
    folders.push(folder);
    for (const [name, byte] of Object.entries(files)) await writeFile(join(folder, name), new Uint8Array([byte]));
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
});
