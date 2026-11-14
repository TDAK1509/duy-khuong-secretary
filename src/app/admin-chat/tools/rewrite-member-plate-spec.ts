import type { ToolSpec } from '../../../services/chat/chat-service.ts';

export const REWRITE_MEMBER_PLATE_SPEC: ToolSpec = {
  name: 'rewrite_member_plate',
  description:
    'Cập nhật biển số xe trên mọi giấy tờ của một tài xế trong nhóm về một biển số mới, và lưu biển số đó làm thông tin lâu dài về người đó. Dùng khi quản lý muốn đổi biển số cho toàn bộ dữ liệu của một người, ví dụ: "Từ nay mọi giấy tờ của Hùng lưu dưới biển 93C123" hoặc "Cập nhật thông tin lưu bởi tài xế Hùng: đổi sang biển số 93C12346".',
  parameters: {
    type: 'object',
    properties: {
      member_id: { type: 'string', description: 'id của tài xế cần cập nhật biển số, lấy từ list_members.' },
      vehicle_plate: { type: 'string', description: 'Biển số xe mới theo định dạng Việt Nam, ví dụ 93C12346. Có thể dùng dấu chấm, gạch ngang hoặc khoảng trắng; hệ thống tự chuẩn hóa.' },
    },
    required: ['member_id', 'vehicle_plate'],
    additionalProperties: false,
  },
};
