import type { ToolSpec } from '../../services/chat/chat-service.ts';

export const ATTACH_PHOTOS_MCP_SPEC: ToolSpec = {
  name: 'attach_photos',
  description:
    'Đọc ảnh gốc của các mục dữ liệu trong nhóm và trả ảnh vào cuộc trò chuyện này. Lấy id từ search_records. Tối đa 4 ảnh. Mục không có ảnh hoặc không được phép xem sẽ bị bỏ qua.',
  parameters: {
    type: 'object',
    properties: {
      record_ids: {
        type: 'array',
        maxItems: 4,
        items: { type: 'string' },
        description: 'id của các mục cần đọc ảnh, lấy từ search_records.',
      },
    },
    required: ['record_ids'],
    additionalProperties: false,
  },
};
