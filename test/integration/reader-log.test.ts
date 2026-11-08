import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';

describe('logging the token use of a reader call', () => {
  let harness: IntakeHarness;
  let loggedLines: string[];

  beforeEach(async () => {
    harness = await createIntakeHarness();
    loggedLines = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => {
      loggedLines.push(line);
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await harness.close();
  });

  it('logs one token line when a member photo is read', async () => {
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    harness.reader.answerWith(makeReading([makeItem()]), { input: 100, output: 40, reasoning: 10 });

    await harness.receivePhoto('zu-hung');

    expect(loggedLines.filter((line) => line.startsWith('[reader]'))).toEqual([
      '[reader] outcome=ok input_tokens=100 output_tokens=40 reasoning_tokens=10',
    ]);
  });
});
