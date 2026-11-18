import type { ToolSpec } from '../../../services/chat/chat-service.ts';

const NULLABLE_STRING = { type: ['string', 'null'] };

export const LIST_FACTS_SPEC: ToolSpec = {
  name: 'list_facts',
  description:
    'Liệt kê các thông tin cố định về chuyến đã lưu bằng save_fact, mới cập nhật trước. Mỗi thông tin có id, nguyên văn, phạm vi, các giá trị, số giấy tờ đã áp dụng và lần cập nhật cuối. Để null mọi bộ lọc để xem tất cả.',
  parameters: {
    type: 'object',
    properties: {
      vehicle_plate: { ...NULLABLE_STRING, description: 'Chỉ lấy thông tin của xe có biển số này, ví dụ 93C04939. null để không lọc.' },
      driver_member_id: { ...NULLABLE_STRING, description: 'Chỉ lấy thông tin của tài xế này, id lấy từ list_members. null để không lọc.' },
      company: { ...NULLABLE_STRING, description: 'Chỉ lấy thông tin có nơi lấy hàng hoặc nơi đổ hàng hoặc khách hàng khớp tên này, không phân biệt dấu. Chỉ ghi phần tên riêng, bỏ các chữ như "công ty", "cty", "TNHH", "CP", ví dụ "TAICERA". null để không lọc.' },
    },
    required: ['vehicle_plate', 'driver_member_id', 'company'],
    additionalProperties: false,
  },
};
