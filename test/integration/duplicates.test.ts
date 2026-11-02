import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Reading } from '../../src/app/reading/reading.ts';
import type { FakeReader } from '../fakes/fake-reader.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

describe('rejecting duplicate papers', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId } = harness);
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('does not save the copy of a saved paper that another driver sends', async () => {
    answerPair(harness.readers.cheap, makeReading([makeFuelItem()]));
    await harness.receivePhoto('zu-hung');

    await harness.receivePhoto('zu-lan');

    expect(await database.query('SELECT 1 FROM records')).toHaveLength(1);
  });

  function makeFuelItem() {
    return makeItem({ category: 'fuel', amount_vnd: 1250000, occurred_on: '2026-10-30', document_number: '0001234' });
  }

  function answerPair(pair: readonly [FakeReader, FakeReader], reading: Reading): void {
    pair.forEach((reader) => reader.answerWith(reading));
  }
});
