import type { ToolSpec } from '../../../services/chat/chat-service.ts';

export const DELETE_DOCUMENT_SPEC: ToolSpec = {
  name: 'delete_document',
  description:
    'Xóa hẳn giấy tờ đã lưu theo lời quản lý, ví dụ "xóa thông tin ảnh này", "xóa phiếu này" khi trả lời một ảnh, hoặc "xóa phiếu số 12345". Xóa giấy tờ cùng các dòng, công ty và liên kết với thông tin cố định của nó. Ảnh và tin nhắn gốc vẫn giữ nguyên. Hệ thống luôn hỏi quản lý xác nhận trước khi xóa. Không hoàn tác được.',
  parameters: {
    type: 'object',
    properties: {
      document_ids: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 20,
        description: 'id của các giấy tờ cần xóa, lấy từ thẻ quoted-photo khi tin nhắn trả lời một ảnh, hoặc từ list_documents. Tối đa 20 id.',
      },
    },
    required: ['document_ids'],
    additionalProperties: false,
  },
};
