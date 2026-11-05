import type { ToolSpec } from '../../services/chat/chat-service.ts';

export const SAVE_RECORD_FROM_TEXT_MCP_SPEC: ToolSpec = {
  name: 'save_record_from_text',
  description:
    'Lưu thông tin công việc do quản lý viết vào nhóm, như khi quản lý nhắn cho Trợ lý qua Zalo. Trợ lý tự đọc nội dung và bỏ qua mục trùng. Không sửa hoặc xóa dữ liệu đã lưu.',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        minLength: 1,
        maxLength: 4000,
        description: 'Thông tin công việc cần lưu, đúng như quản lý viết. Ghi rõ việc gì, xe nào, ngày nào và số tiền nếu có.',
      },
    },
    required: ['text'],
    additionalProperties: false,
  },
};
