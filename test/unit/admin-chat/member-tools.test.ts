import { describe, expect, it } from 'vitest';
import { ADMIN_TOOLS } from '../../../src/app/admin-chat/tools/admin-tools.ts';
import { MEMBER_TOOLS } from '../../../src/app/admin-chat/tools/member-tools.ts';

describe('the member tool list', () => {
  it('offers search_records with the member description', () => {
    expect(findTool('search_records').description).toBe(
      'Tìm dữ liệu do chính bạn gửi trong nhóm hiện tại. Lọc theo ngày gửi hoặc ngày trên giấy tờ. Tối đa 50 mục mỗi trang, mới nhất trước. Nếu next_cursor khác null, dùng cursor đó để xem tiếp.',
    );
  });

  it('keeps the parameters of the admin search and says the member is always null', () => {
    const properties = readProperties('search_records');

    expect(Object.keys(properties)).toEqual(Object.keys(readAdminProperties('search_records')));
    expect(properties['member']).toEqual({
      type: ['string', 'null'],
      description: 'Luôn là null. Công cụ chỉ tìm dữ liệu do chính bạn gửi.',
    });
  });

  it('offers count_records with the member description', () => {
    expect(findTool('count_records').description).toBe(
      'Đếm chính xác số mục và cộng tiền theo từng loại trong khoảng ngày gửi. Chỉ tính dữ liệu do chính bạn gửi.',
    );
  });

  it('offers attach_photos with the member description', () => {
    expect(findTool('attach_photos').description).toBe(
      'Gửi ảnh gốc của dữ liệu do chính bạn gửi, ngay sau câu trả lời. Lấy record_ids từ search_records. Tối đa 4 ảnh. Bỏ qua mục không có ảnh hoặc không được phép xem.',
    );
  });

  function findTool(name: string) {
    const tool = MEMBER_TOOLS.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`no member tool ${name}`);
    return tool;
  }

  function readProperties(name: string): Record<string, unknown> {
    return findTool(name).parameters['properties'] as Record<string, unknown>;
  }

  function readAdminProperties(name: string): Record<string, unknown> {
    return ADMIN_TOOLS.find((candidate) => candidate.name === name)?.parameters['properties'] as Record<string, unknown>;
  }
});
