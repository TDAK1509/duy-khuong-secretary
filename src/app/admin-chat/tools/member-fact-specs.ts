import type { ToolSpec } from '../../../services/chat/chat-service.ts';
import { FACT_READERS } from '../../memory/fact-readers.ts';

const LIST_MEMBER_FACTS_SPEC: ToolSpec = {
  name: 'list_member_facts',
  description: 'Liệt kê các thông tin đã lưu về một người trong nhóm mà quản lý đang trò chuyện được xem, đúng như đã lưu, kèm người được xem (readers).',
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
    'Thêm một thông tin lâu dài về một người trong nhóm. Mặc định các quản lý và chính người đó xem được, và hệ thống dùng thông tin này để đọc giá trị không rõ hoặc bị thiếu khi người đó gửi ảnh hoặc tin nhắn. Giá trị in rõ trên giấy tờ luôn được giữ. Không thay thế các thông tin đã lưu. Nếu thông tin này đã có, giữ nguyên.',
  parameters: {
    type: 'object',
    properties: {
      member_id: { type: 'string', description: 'id của người được lưu thông tin, lấy từ list_members.' },
      fact: { type: 'string', description: 'Thông tin cần lưu, một câu ngắn trên một dòng, từ 1 đến 200 ký tự. Giữ đúng số, mã và tên quản lý viết.' },
      readers: {
        type: 'string',
        enum: [...FACT_READERS],
        description:
          'Ai xem được thông tin này. admins_and_member: các quản lý và chính người đó; hệ thống dùng thông tin khi đọc ảnh và tin nhắn người đó gửi. admins: chỉ các quản lý. author: chỉ quản lý đang trò chuyện. Dùng admins_and_member nếu quản lý không nói ai được xem.',
      },
    },
    required: ['member_id', 'fact', 'readers'],
    additionalProperties: false,
  },
};

const FORGET_MEMBER_FACT_SPEC: ToolSpec = {
  name: 'forget_member_fact',
  description: 'Xóa đúng một thông tin đã lưu về một người trong nhóm mà quản lý đang trò chuyện được xem. Không sửa hoặc xóa thông tin khác.',
  parameters: {
    type: 'object',
    properties: {
      member_id: { type: 'string', description: 'id của người có thông tin cần xóa, lấy từ list_members.' },
      fact: { type: 'string', description: 'Nội dung thông tin cần xóa, chép đúng như kết quả của list_member_facts.' },
    },
    required: ['member_id', 'fact'],
    additionalProperties: false,
  },
};

const FORGET_ALL_MEMBER_FACTS_SPEC: ToolSpec = {
  name: 'forget_all_member_facts',
  description: 'Xóa mọi thông tin đã lưu về một người trong nhóm mà quản lý đang trò chuyện được xem. Chỉ dùng khi quản lý yêu cầu xóa hết thông tin về người này.',
  parameters: {
    type: 'object',
    properties: { member_id: { type: 'string', description: 'id của người cần xóa hết thông tin, lấy từ list_members.' } },
    required: ['member_id'],
    additionalProperties: false,
  },
};

export const MEMBER_FACT_TOOLS: ToolSpec[] = [LIST_MEMBER_FACTS_SPEC, ADD_MEMBER_FACT_SPEC, FORGET_MEMBER_FACT_SPEC, FORGET_ALL_MEMBER_FACTS_SPEC];
