import type { ToolSpec } from '../../../services/chat/chat-service.ts';

export const LIST_MERGED_NAMES_SPEC: ToolSpec = {
  name: 'list_merged_names',
  description:
    'Liệt kê các tên đọc được trên giấy tờ mà hệ thống đã tự gộp vào một công ty hoặc nơi chốn đã lưu: tên đọc được, tên đã lưu, ngày gộp (giờ Việt Nam) và số giấy tờ. Mới nhất trước. Tối đa 50 tên. left_out đếm số tên phù hợp không có trong kết quả.',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: ['string', 'null'],
        description: 'Một phần tên đọc được hoặc tên đã lưu, không phân biệt dấu và chữ hoa. null để lấy tất cả.',
      },
    },
    required: ['text'],
    additionalProperties: false,
  },
};

export const SPLIT_MERGED_NAME_SPEC: ToolSpec = {
  name: 'split_merged_name',
  description:
    'Tách một tên đã tự gộp thành một công ty hoặc nơi chốn riêng. Mọi giấy tờ cũ và mới có đúng tên này được tính cho bên riêng đó, không tính cho tên đã lưu nữa. Kết quả là số giấy tờ đã chuyển.',
  parameters: {
    type: 'object',
    properties: {
      printed_name: {
        type: 'string',
        description: 'Tên cần tách, chép đúng từ tin nhắn của quản lý. Không phân biệt dấu và chữ hoa.',
      },
    },
    required: ['printed_name'],
    additionalProperties: false,
  },
};
