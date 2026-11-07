import { describe, expect, it } from 'vitest';
import { ADMIN_TOOLS } from '../../../src/app/admin-chat/tools/admin-tools.ts';

describe('the admin tool list', () => {
  it('offers create_scheduled_task with its description', () => {
    const tool = ADMIN_TOOLS.find((candidate) => candidate.name === 'create_scheduled_task');

    expect(tool?.description).toBe(
      'Đặt lịch để Trợ lý tự làm một việc vào giờ đã hẹn và gửi kết quả cho quản lý. Giờ là giờ Việt Nam. Lịch được lưu và bắt đầu chạy ngay.',
    );
  });

  it('offers list_members with the join date and no Zalo name', () => {
    const tool = ADMIN_TOOLS.find((candidate) => candidate.name === 'list_members');

    expect(tool?.description).toBe('Liệt kê mọi người trong nhóm: id, tên trong nhóm, vai trò, ngày vào nhóm.');
  });

  it('offers search_records with a free category and no fixed list', () => {
    const tool = ADMIN_TOOLS.find((candidate) => candidate.name === 'search_records');
    const category = (tool?.parameters['properties'] as Record<string, unknown>)['category'];

    expect(category).toEqual({
      type: ['string', 'null'],
      description:
        'Tên loại đã lưu, ví dụ "đổ xăng dầu", "kiểm định xe". Không có danh sách loại cố định. null để tìm mọi loại. Nếu chưa biết đúng tên loại, để null và dùng text.',
    });
  });

  it('offers search_records with the document date range after the date sent range', () => {
    const tool = ADMIN_TOOLS.find((candidate) => candidate.name === 'search_records');
    const properties = tool?.parameters['properties'] as Record<string, unknown>;

    expect(tool?.description).toBe(
      'Tìm dữ liệu đã lưu trong nhóm. Lọc được theo ngày gửi và ngày trên giấy tờ. Trả về tối đa 50 mục mỗi trang, mới nhất trước. Nếu next_cursor khác null, gọi lại với cursor đó để đọc trang tiếp theo.',
    );
    expect(Object.keys(properties)).toEqual(['text', 'category', 'member', 'plate', 'added_from', 'added_to', 'occurred_from', 'occurred_to', 'cursor']);
    expect(properties['occurred_from']).toEqual({
      type: ['string', 'null'],
      description: 'Lấy mục có ngày công việc trên giấy tờ từ ngày này, dạng YYYY-MM-DD, tính cả ngày này. Mục thiếu ngày bị loại. null nếu không giới hạn.',
    });
    expect(properties['occurred_to']).toEqual({
      type: ['string', 'null'],
      description: 'Lấy mục có ngày công việc trên giấy tờ đến hết ngày này, dạng YYYY-MM-DD. Mục thiếu ngày bị loại. null nếu không giới hạn.',
    });
    expect(tool?.parameters['required']).toEqual(['text', 'category', 'member', 'plate', 'added_from', 'added_to', 'occurred_from', 'occurred_to', 'cursor']);
  });

  it('offers no propose_scheduled_task', () => {
    expect(ADMIN_TOOLS.map((tool) => tool.name)).not.toContain('propose_scheduled_task');
  });
});
