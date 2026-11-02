import { describe, expect, it } from 'vitest';
import { buildAdminPrompt } from '../../../src/app/admin-chat/admin-prompt.ts';

describe('the scheduling section of the admin prompt', () => {
  const prompt = buildAdminPrompt({ workspaceName: 'Xe tải Duy Khương', displayName: 'Duy', now: new Date('2026-10-31T10:00:00+07:00') });

  it.each([
    '- Dùng create_scheduled_task để đặt lịch, list_scheduled_tasks để xem, cancel_scheduled_task để hủy.',
    '- Lịch được lưu và bắt đầu chạy ngay khi bạn gọi create_scheduled_task. Hệ thống tự gửi bản tóm tắt lịch ngay sau câu trả lời của bạn. Trả lời ngắn: "Đã đặt lịch." Không nhắc lại nội dung lịch.',
    '- Muốn sửa một lịch: dùng list_scheduled_tasks để lấy id, cancel_scheduled_task để hủy lịch cũ, rồi gọi create_scheduled_task để đặt lịch mới.',
  ])('holds the line %s', (line) => {
    expect(prompt.split('\n')).toContain(line);
  });

  it('no longer speaks of a draft', () => {
    expect(prompt).not.toContain('bản nháp');
  });
});
