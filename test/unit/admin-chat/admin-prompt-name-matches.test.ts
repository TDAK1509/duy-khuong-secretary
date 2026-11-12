import { describe, expect, it } from 'vitest';
import { buildAdminPrompt } from '../../../src/app/admin-chat/admin-prompt.ts';

const REVIEW_LINE =
  '- Để xem các tên đang chờ xác nhận, gọi review_name_matches. Hệ thống tự gửi danh sách ngay sau câu trả lời. Nếu kết quả là 0, trả lời: "Không có tên nào đang chờ xác nhận." Không tự xác nhận thay quản lý.';

describe('the name confirmation rule of the admin prompt', () => {
  const prompt = buildAdminPrompt({ workspaceName: 'Xe tải Duy Khương', displayName: 'Duy', now: new Date('2026-10-31T10:00:00+07:00'), memory: '' });

  it('holds the review_name_matches line', () => {
    expect(prompt.split('\n')).toContain(REVIEW_LINE);
  });

  it('ends the search section with the line', () => {
    expect(prompt).toContain(`${REVIEW_LINE}\n\nNguồn dữ liệu:`);
  });
});
