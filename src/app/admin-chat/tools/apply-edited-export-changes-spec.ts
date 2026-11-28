import type { ToolSpec } from '../../../services/chat/chat-service.ts';

export const APPLY_EDITED_EXPORT_CHANGES_SPEC: ToolSpec = {
  name: 'apply_edited_export_changes',
  description:
    'Áp dụng các thay đổi trong file Excel đã trả lại sau khi quản lý đã xác nhận nguyên nhân của từng thay đổi. Với lỗi chỉ của một giấy tờ, sửa đúng giấy tờ đó. Với thông tin dùng lại cho các chuyến phù hợp, lưu hoặc sửa kiến thức công ty. Mỗi change_id phải đến từ list_edited_export_changes và phải có quyết định rõ của quản lý. Công cụ từ chối thay đổi đã cũ, không hỗ trợ hoặc chưa được xác nhận. Một thay đổi kiến thức gặp action "conflict" hoặc "check_notes" vẫn chờ; gọi lại với cùng change_id sau khi quản lý trả lời.',
  parameters: {
    type: 'object',
    properties: {
      decisions: {
        type: 'array',
        description: 'Mỗi thay đổi quản lý đã quyết định, đúng một mục cho mỗi change_id cần xử lý.',
        items: {
          type: 'object',
          properties: {
            change_id: { type: 'string', description: 'id thay đổi từ list_edited_export_changes.' },
            cause: {
              type: 'string',
              enum: ['paper_reading', 'company_knowledge', 'dismiss'],
              description: 'paper_reading: giá trị chỉ sai trên giấy tờ này. company_knowledge: đây là thông tin lâu dài cho mọi giấy tờ hoặc chuyến khớp điều kiện. dismiss: bỏ thay đổi này, không lưu.',
            },
            replace_conflicts: {
              type: 'boolean',
              description: 'Lần đầu luôn là false. Chỉ là true khi gọi lại sau action "conflict" cho change_id này và quản lý đã chọn thông tin mới là đúng. Không tự chọn thay quản lý.',
            },
            notes_checked: {
              type: 'boolean',
              description: 'Lần đầu luôn là false. Chỉ là true khi gọi lại sau action "check_notes" cho change_id này và bạn đã so related_notes với thông tin sắp lưu, hoặc quản lý đã chọn sau khi bạn hỏi.',
            },
          },
          required: ['change_id', 'cause', 'replace_conflicts', 'notes_checked'],
          additionalProperties: false,
        },
      },
    },
    required: ['decisions'],
    additionalProperties: false,
  },
};
