import type { ToolSpec } from '../../../services/chat/chat-service.ts';

export const LIST_COMPANY_KNOWLEDGE_SPEC: ToolSpec = {
  name: 'list_company_knowledge',
  description: 'Liệt kê kiến thức công ty đã lưu, cũ nhất trước. Mỗi mục có entry_id, câu quản lý viết, when, then, người lưu và số giấy tờ đang khớp.',
  parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
};
