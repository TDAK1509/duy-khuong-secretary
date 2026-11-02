import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import { insertMember } from './workspace-rows.ts';

describe('the service connected as the runtime role', () => {
  describe('when two drivers send the same paper', () => {
    let harness: IntakeHarness;

    beforeEach(async () => {
      harness = await createIntakeHarness();
      harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
      await insertMember(harness.database, { workspaceId: harness.workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    });

    afterEach(async () => {
      await harness.close();
    });

    it('still sees the record of another driver in the duplicate check', async () => {
      const fuel = makeItem({ category: 'fuel', amount_vnd: 1250000, occurred_on: '2026-10-30', document_number: '0001234' });
      for (const reader of [...harness.readers.cheap]) reader.answerWith(makeReading([fuel]));
      await harness.receivePhoto('zu-hung');
      await harness.sendQueuedTexts();
      harness.channel.texts.splice(0);

      await harness.receivePhoto('zu-lan');
      await harness.sendQueuedTexts();

      expect(harness.channel.texts.map((sent) => sent.to.externalUserId)).toEqual(['zu-lan']);
      expect(await harness.database.query('SELECT 1 FROM records')).toHaveLength(1);
    });
  });
});
