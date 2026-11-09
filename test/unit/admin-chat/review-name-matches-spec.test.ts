import { describe, expect, it } from 'vitest';
import { AdminTextGuard, CHANGE_TOOLS, MEMBER_TEXT_TOOLS } from '../../../src/app/admin-chat/tools/admin-text-guard.ts';
import { ADMIN_TOOLS } from '../../../src/app/admin-chat/tools/admin-tools.ts';

describe('the review_name_matches tool', () => {
  it('is offered with its name, description and empty parameters', () => {
    const tool = ADMIN_TOOLS.find((candidate) => candidate.name === 'review_name_matches');

    expect(tool).toStrictEqual({
      name: 'review_name_matches',
      description:
        'Gửi cho quản lý danh sách các tên mới đọc được gần giống tên đã lưu, để quản lý trả lời số xác nhận. Công cụ không gộp tên nào. Kết quả là số cặp tên đang chờ xác nhận.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    });
  });

  it('is a member text tool', () => {
    expect(MEMBER_TEXT_TOOLS).toContain('review_name_matches');
  });

  it.each(CHANGE_TOOLS)('makes the guard refuse %s after a call', (changeTool) => {
    const guard = new AdminTextGuard(false);
    guard.noteCall('review_name_matches');

    expect(guard.refuses(changeTool)).toBe(true);
  });
});
