import type { ToolSpec } from '../../../services/chat/chat-service.ts';

function describeIds(description: string) {
  return { type: 'array', items: { type: 'string' }, description };
}

export const ADMIN_ATTACH_PHOTOS_SPEC: ToolSpec = {
  name: 'attach_photos',
  description:
    'Gửi kèm ảnh gốc của các mục dữ liệu hoặc giấy tờ ngay sau câu trả lời, mỗi ảnh một tin nhắn. Lấy record_ids từ search_records, document_ids từ list_documents. Tối đa 4 ảnh. Mục không có ảnh hoặc không được phép xem sẽ bị bỏ qua.',
  parameters: {
    type: 'object',
    properties: {
      record_ids: describeIds('id của các mục cần gửi ảnh. Mảng rỗng nếu không có.'),
      document_ids: describeIds('id của các giấy tờ cần gửi ảnh, lấy từ list_documents. Mảng rỗng nếu không có.'),
    },
    required: ['record_ids', 'document_ids'],
    additionalProperties: false,
  },
};

export const ADMIN_LIST_SOURCES_SPEC: ToolSpec = {
  name: 'list_sources',
  description:
    'Tìm tin gốc của các mục dữ liệu: ai gửi, gửi lúc nào (giờ Việt Nam), gửi ảnh hay tin nhắn, và ngày trên giấy tờ. Lấy record_ids từ search_records, document_ids từ list_documents. Tối đa 5 tin gốc mỗi lần gọi, theo thứ tự id. Hệ thống tự gửi một thẻ nguồn có nguyên văn tin nhắn cho mỗi tin gốc ngay sau câu trả lời. left_out đếm số id không có trong kết quả. Nếu quoted là true, thẻ nguồn trích lại tin gốc trong cuộc trò chuyện này.',
  parameters: {
    type: 'object',
    properties: {
      record_ids: describeIds('id các mục cần xem nguồn, lấy từ search_records. Mảng rỗng nếu không có.'),
      document_ids: describeIds('id các giấy tờ cần xem nguồn, lấy từ list_documents. Mảng rỗng nếu không có.'),
    },
    required: ['record_ids', 'document_ids'],
    additionalProperties: false,
  },
};
