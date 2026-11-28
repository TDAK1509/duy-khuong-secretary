import type { ToolSpec } from '../../../services/chat/chat-service.ts';
import { KNOWLEDGE_PROPERTIES, KNOWLEDGE_PROPERTY_NAMES } from './company-knowledge-properties.ts';

export const UPDATE_COMPANY_KNOWLEDGE_SPEC: ToolSpec = {
  name: 'update_company_knowledge',
  description:
    'Thay toàn bộ when và then của một kiến thức công ty theo entry_id từ list_company_knowledge. Giá trị không còn đúng phải truyền null; không giữ ngầm giá trị cũ. Tính lại giấy tờ khớp và trả về số giấy tờ khớp. Nếu sau khi đổi trùng mọi điều kiện when với một mục khác, công cụ không đổi gì và trả về other_entry_id. Kết quả có example_documents: tối đa 3 giấy tờ khớp, mới nhất trước. Trước khi lưu, công cụ tìm mục có điều kiện chồng lấp nhưng kết quả khác (action "conflict") và các ghi chú có điều kiện chồng lấp (action "check_notes"); khi đó chưa đổi gì.',
  parameters: {
    type: 'object',
    properties: {
      entry_id: { type: 'string', description: 'id của kiến thức cần thay, lấy từ list_company_knowledge.' },
      ...KNOWLEDGE_PROPERTIES,
    },
    required: ['entry_id', ...KNOWLEDGE_PROPERTY_NAMES],
    additionalProperties: false,
  },
};
