import { describe, expect, it } from 'vitest';
import { buildScheduledRunPrompt } from '../../../src/app/scheduled-runs/scheduled-run-prompt.ts';

describe('the scheduled-run prompt', () => {
  const prompt = buildScheduledRunPrompt({
    workspaceName: 'Xe tải Duy Khương',
    taskTitle: 'Tổng trọng lượng tuần',
    creatorName: 'Duy',
    now: new Date('2026-11-07T10:00:00+07:00'),
  });

  it('names the document tools and asks to say when the request is unclear', () => {
    expect(prompt).toContain(
      [
        '- Dùng search_records, count_records, maintenance_status, list_members, list_document_numbers, total_document_numbers và list_organizations để lấy dữ liệu. Không bịa thông tin.',
        '- Nếu yêu cầu không nói rõ tính số nào hoặc theo ngày nào, không tự chọn. Viết trong kết quả rằng yêu cầu chưa rõ và liệt kê các ý nghĩa có thể chọn từ list_document_numbers.',
      ].join('\n'),
    );
  });

  it('no longer holds the old tool line', () => {
    expect(prompt).not.toContain('- Dùng search_records, count_records, maintenance_status và list_members để lấy dữ liệu.');
  });
});
