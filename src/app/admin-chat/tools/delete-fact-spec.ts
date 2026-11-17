import type { ToolSpec } from '../../../services/chat/chat-service.ts';

export const DELETE_FACT_SPEC: ToolSpec = {
  name: 'delete_fact',
  description:
    'Xóa hẳn một thông tin cố định về chuyến đã lưu, theo id lấy từ list_facts. Các giá trị của thông tin không còn áp dụng cho giấy tờ nào. Giấy tờ vẫn giữ nguyên. Không hoàn tác được.',
  parameters: {
    type: 'object',
    properties: { fact_id: { type: 'string', description: 'id của thông tin cần xóa, lấy từ list_facts.' } },
    required: ['fact_id'],
    additionalProperties: false,
  },
};
