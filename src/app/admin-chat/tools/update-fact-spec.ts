import type { ToolSpec } from '../../../services/chat/chat-service.ts';

const NULLABLE_STRING = { type: ['string', 'null'] };
const SCOPE_FIELDS = ['vehicle_plate', 'driver', 'pickup_company', 'dropoff_company'];

export const UPDATE_FACT_SPEC: ToolSpec = {
  name: 'update_fact',
  description:
    'Sửa một thông tin cố định về chuyến đã lưu, theo id lấy từ list_facts. Đặt hoặc thay từng giá trị, xóa từng giá trị, hoặc đổi phạm vi. Giá trị không nêu giữ nguyên. Khi phạm vi đổi, hệ thống tính lại các giấy tờ áp dụng.',
  parameters: {
    type: 'object',
    properties: {
      fact_id: { type: 'string', description: 'id của thông tin, lấy từ list_facts.' },
      change_statement: { type: 'string', description: 'Nguyên văn câu quản lý viết để sửa.' },
      set_values: {
        type: 'array',
        description: 'Các giá trị cần đặt mới hoặc thay. Trùng tên (không phân biệt dấu) với giá trị đã lưu thì thay giá trị đó.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Tên giá trị, ví dụ "Lương tài xế".' },
            number: { type: ['number', 'null'], description: 'Số tiền theo đồng, ví dụ 550k là 550000. null nếu giá trị là chữ.' },
            unit: { ...NULLABLE_STRING, description: '"đ" cho số tiền mỗi chuyến, "đ/tấn" cho số tiền mỗi tấn. null nếu giá trị là chữ.' },
            text: { ...NULLABLE_STRING, description: 'Giá trị dạng chữ. null nếu giá trị là số.' },
          },
          required: ['name', 'number', 'unit', 'text'],
          additionalProperties: false,
        },
      },
      remove_values: { type: 'array', items: { type: 'string' }, description: 'Tên các giá trị cần xóa khỏi thông tin này.' },
      vehicle_plate: { ...NULLABLE_STRING, description: 'Biển số xe mới. null để giữ nguyên.' },
      driver_member_id: { ...NULLABLE_STRING, description: 'id tài xế mới, lấy từ list_members. null để giữ nguyên.' },
      pickup_company: { ...NULLABLE_STRING, description: 'Nơi lấy hàng mới, bỏ chữ "công ty" hoặc "cty" đứng trước tên. null để giữ nguyên.' },
      dropoff_company: { ...NULLABLE_STRING, description: 'Nơi đổ hàng mới, bỏ chữ "công ty" hoặc "cty" đứng trước tên. null để giữ nguyên.' },
      clear_scope: { type: 'array', items: { type: 'string', enum: SCOPE_FIELDS }, description: 'Các phần phạm vi cần bỏ hẳn. Để trống nếu không bỏ phần nào.' },
    },
    required: ['fact_id', 'change_statement', 'set_values', 'remove_values', 'vehicle_plate', 'driver_member_id', 'pickup_company', 'dropoff_company', 'clear_scope'],
    additionalProperties: false,
  },
};
