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

export const MEMBER_FACT_TOOLS: ToolSpec[] = [LIST_MEMBER_FACTS_SPEC];
