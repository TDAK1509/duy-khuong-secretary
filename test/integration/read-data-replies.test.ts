import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import { insertMember } from './workspace-rows.ts';

const ADMIN_LAST_WROTE_AT = new Date('2026-11-01T10:00:00+07:00');

describe('the data read from a photo in the reply', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    const { database, workspaceId } = harness;
    await insertMember(database, {
      workspaceId,
      externalUserId: 'zu-duy',
      displayName: 'Duy',
      role: 'admin',
      lastInboundAt: ADMIN_LAST_WROTE_AT,
    });
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
  });

  afterEach(async () => {
    await harness.close();
  });

  it("ends an admin's own photo reply with the data read", async () => {
    harness.reader.answerWith(
      makeReading([makeItem({ category: 'phiếu cân', amount_vnd: null, occurred_on: '2026-11-05', document_number: '20261105062' })]),
    );

    await harness.receivePhoto('zu-duy');
    await harness.sendAllQueuedTexts();

    expect(readTextsTo('zu-duy')).toEqual([
      'Đã lưu: Phiếu cân, số 20261105062, ngày 05/11/2026.\n\nDữ liệu đã đọc:\nMục 1: phiếu cân\n- Số phiếu: 20261105062\n- Ngày trên giấy tờ: 05/11/2026',
    ]);
  });

  it("keeps the data read out of a member's own reply", async () => {
    harness.reader.answerWith(makeReading([makeItem({ category: 'phiếu cân', amount_vnd: null, document_number: '20261105062' })]));

    await harness.receivePhoto('zu-hung');
    await harness.sendAllQueuedTexts();

    const memberTexts = readTextsTo('zu-hung');
    expect(memberTexts).toHaveLength(1);
    expect(memberTexts[0]).not.toContain('Dữ liệu đã đọc:');
  });

  it('loses no line of a block longer than one message', async () => {
    const details = Array.from({ length: 80 }, (_, index) => ({ label: `Dòng ${index + 1}`, value: `giá trị số ${index + 1} của phiếu cân` }));
    harness.reader.answerWith(
      makeReading([makeItem({ category: 'phiếu cân', amount_vnd: null, occurred_on: null, document_number: '20261105062', details })]),
    );

    await harness.receivePhoto('zu-duy');
    await harness.sendAllQueuedTexts();

    const parts = readTextsTo('zu-duy');
    const expectedBlock = [
      'Dữ liệu đã đọc:',
      'Mục 1: phiếu cân',
      '- Số phiếu: 20261105062',
      ...details.map(({ label, value }) => `- ${label}: ${value}`),
    ].join('\n');
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => Array.from(part).length <= harness.channel.maxTextLength)).toBe(true);
    expect(parts.join('\n')).toBe(`Đã lưu: Phiếu cân, số 20261105062.\n\n${expectedBlock}`);
  });

  function readTextsTo(externalUserId: string): string[] {
    return harness.channel.sends.flatMap((sent) => (sent.kind === 'text' && sent.to === externalUserId ? [sent.text] : []));
  }
});
