import type { ToolSpec } from '../../../services/chat/chat-service.ts';

export const DELETE_COMPANY_KNOWLEDGE_SPEC: ToolSpec = {
  name: 'delete_company_knowledge',
  description: 'Xóa hẳn một kiến thức công ty theo entry_id từ list_company_knowledge. Giấy tờ đã lưu vẫn giữ nguyên dữ liệu đọc từ giấy. Không hoàn tác được.',
  parameters: {
    type: 'object',
    properties: { entry_id: { type: 'string', description: 'id của kiến thức cần xóa, lấy từ list_company_knowledge.' } },
    required: ['entry_id'],
    additionalProperties: false,
  },
};
