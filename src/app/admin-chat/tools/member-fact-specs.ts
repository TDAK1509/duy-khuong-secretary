import type { ToolSpec } from '../../../services/chat/chat-service.ts';

const LIST_MEMBER_FACTS_SPEC: ToolSpec = {
  name: 'list_member_facts',
  description: 'Liệt kê các thông tin quản lý đã lưu về một người trong nhóm, đúng như đã lưu.',
  parameters: {
    type: 'object',
    properties: { member_id: { type: 'string', description: 'id của người cần xem, lấy từ list_members.' } },
    required: ['member_id'],
    additionalProperties: false,
  },
};

const ADD_MEMBER_FACT_SPEC: ToolSpec = {
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
};

export const MEMBER_FACT_TOOLS: ToolSpec[] = [LIST_MEMBER_FACTS_SPEC, ADD_MEMBER_FACT_SPEC];
