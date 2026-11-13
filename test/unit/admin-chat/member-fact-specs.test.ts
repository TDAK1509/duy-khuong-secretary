import { describe, expect, it } from 'vitest';
import { ADMIN_TOOLS } from '../../../src/app/admin-chat/tools/admin-tools.ts';

describe('the member fact tool specs', () => {
  it('offers list_member_facts with the exact text', () => {
    const tool = findTool('list_member_facts');

    expect(tool).toStrictEqual({
      name: 'list_member_facts',
      description: 'Liệt kê các thông tin quản lý đã lưu về một người trong nhóm, đúng như đã lưu.',
      parameters: {
        type: 'object',
        properties: { member_id: { type: 'string', description: 'id của người cần xem, lấy từ list_members.' } },
        required: ['member_id'],
        additionalProperties: false,
      },
    });
  });

  it('offers add_member_fact with the exact text', () => {
    const tool = findTool('add_member_fact');

    expect(tool).toStrictEqual({
      name: 'add_member_fact',
      description:
        'Thêm một thông tin lâu dài về một người trong nhóm. Khi người đó gửi ảnh hoặc tin nhắn, hệ thống dùng thông tin này để đọc giá trị không rõ hoặc bị thiếu. Giá trị in rõ trên giấy tờ luôn được giữ. Không thay thế các thông tin đã lưu. Nếu thông tin này đã có, giữ nguyên.',
      parameters: {
        type: 'object',
        properties: {
          member_id: { type: 'string', description: 'id của người được lưu thông tin, lấy từ list_members.' },
          fact: { type: 'string', description: 'Thông tin cần lưu, một câu ngắn trên một dòng, từ 1 đến 200 ký tự. Giữ đúng số, mã và tên quản lý viết.' },
        },
        required: ['member_id', 'fact'],
        additionalProperties: false,
      },
    });
  });

  it('offers forget_member_fact with the exact text', () => {
    const tool = findTool('forget_member_fact');

    expect(tool).toStrictEqual({
      name: 'forget_member_fact',
      description: 'Xóa đúng một thông tin đã lưu về một người trong nhóm. Không sửa hoặc xóa thông tin khác.',
      parameters: {
        type: 'object',
        properties: {
          member_id: { type: 'string', description: 'id của người có thông tin cần xóa, lấy từ list_members.' },
          fact: { type: 'string', description: 'Nội dung thông tin cần xóa, chép đúng như kết quả của list_member_facts.' },
        },
        required: ['member_id', 'fact'],
        additionalProperties: false,
      },
    });
  });

  it('offers forget_all_member_facts with the exact text', () => {
    const tool = findTool('forget_all_member_facts');

    expect(tool).toStrictEqual({
      name: 'forget_all_member_facts',
      description: 'Xóa mọi thông tin đã lưu về một người trong nhóm. Chỉ dùng khi quản lý yêu cầu xóa hết thông tin về người này.',
      parameters: {
        type: 'object',
        properties: { member_id: { type: 'string', description: 'id của người cần xóa hết thông tin, lấy từ list_members.' } },
        required: ['member_id'],
        additionalProperties: false,
      },
    });
  });

  it('puts the four tools right after remove_member in the admin tool list', () => {
    const names = ADMIN_TOOLS.map((tool) => tool.name);

    const afterRemoveMember = names.slice(names.indexOf('remove_member') + 1, names.indexOf('remove_member') + 5);
    expect(afterRemoveMember).toEqual(['list_member_facts', 'add_member_fact', 'forget_member_fact', 'forget_all_member_facts']);
  });

  function findTool(name: string) {
    return ADMIN_TOOLS.find((candidate) => candidate.name === name);
  }
});
