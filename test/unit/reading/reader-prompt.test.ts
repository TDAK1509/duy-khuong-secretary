import { describe, expect, it } from 'vitest';
import { buildReaderPrompt } from '../../../src/app/reading/reader-prompt.ts';

describe('buildReaderPrompt', () => {
  it("ends with today's Vietnam date", () => {
    const lateEveningUtc = new Date('2026-10-30T18:00:00Z');

    const prompt = buildReaderPrompt(lateEveningUtc);

    expect(prompt.endsWith('- Hôm nay là 31/10/2026 (giờ Việt Nam).')).toBe(true);
  });

  it('asks for the printed title of the document', () => {
    const prompt = buildReaderPrompt(new Date('2026-10-30T18:00:00Z'));

    expect(prompt).toContain('4b. document_title: tiêu đề in trên giấy tờ, chép đủ từng chữ');
  });

  it('suggests the category names instead of fixing a list', () => {
    const prompt = buildReaderPrompt(new Date('2026-10-30T18:00:00Z'));

    expect(prompt).toContain('Nếu không phù hợp, ghi một tên ngắn khác theo nội dung thực tế.');
  });
});
