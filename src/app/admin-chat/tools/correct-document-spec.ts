import type { ToolSpec } from '../../../services/chat/chat-service.ts';

export const CORRECT_DOCUMENT_SPEC: ToolSpec = {
  name: 'correct_document',
  description:
    'Sửa biển số, số giấy tờ, ngày hoặc loại phiếu (lấy hàng hay đổ hàng) của giấy tờ đã lưu, theo lời quản lý. Dùng khi quản lý nói giá trị đúng của một giấy tờ đã lưu, ví dụ "số xe là 00X00002", "biển số trên ảnh là 00X00002", "đổi 00X00002 thành 00X00003", "ngày trên phiếu số 12345 là 02/11/2026". Công cụ tự tìm giấy tờ đã lưu khớp, không cần list_documents hay search_records trước. Một giấy tờ khớp thì sửa ngay. Nhiều giấy tờ khớp mà không có all_matching thì chưa sửa gì và trả danh sách để hỏi quản lý. Giá trị mới phải có trong chữ quản lý đã gõ, nếu không công cụ từ chối và chưa sửa gì. Cần ít nhất một giá trị mới và một cách chỉ ra giấy tờ.',
  parameters: {
    type: 'object',
    properties: {
      new_plate: { type: ['string', 'null'], description: 'Biển số đúng, chép đúng từ tin nhắn của quản lý, ví dụ 00X00002. Có thể có dấu chấm, gạch ngang hoặc khoảng trắng. null nếu không sửa biển số.' },
      new_number: { type: ['string', 'null'], description: 'Số giấy tờ đúng, chép đúng từ tin nhắn của quản lý. Chỉ đặt được cho một giấy tờ. null nếu không sửa số giấy tờ.' },
      new_date: { type: ['string', 'null'], description: 'Ngày đúng của giấy tờ, dạng YYYY-MM-DD. Ngày và tháng phải có trong tin nhắn của quản lý. null nếu không sửa ngày.' },
      new_stage: { type: ['string', 'null'], enum: ['dispatch', 'receipt', null], description: 'dispatch: phiếu lấy hàng, lúc hàng rời nơi lấy. receipt: phiếu đổ hàng, lúc hàng đến nơi đổ. null nếu không sửa.' },
      last_photo: { type: 'boolean', description: 'true: giấy tờ trong ảnh quản lý gửi gần nhất trước tin nhắn này. Dùng khi quản lý nói "xe này", "phiếu này" hoặc chỉ nêu một biển số ngay sau khi gửi ảnh.' },
      current_plate: { type: ['string', 'null'], description: 'Biển số đang lưu trên giấy tờ cần sửa. null nếu không dùng cách này để chỉ ra giấy tờ.' },
      current_number: { type: ['string', 'null'], description: 'Số đang lưu trên giấy tờ cần sửa. null nếu không dùng cách này để chỉ ra giấy tờ.' },
      current_date: { type: ['string', 'null'], description: 'Ngày đang lưu trên giấy tờ cần sửa, dạng YYYY-MM-DD. null nếu không dùng cách này để chỉ ra giấy tờ.' },
      all_matching: { type: 'boolean', description: 'true chỉ khi quản lý nói rõ sửa mọi giấy tờ khớp, ví dụ "cả hai" hoặc "tất cả". Số giấy tờ mới không bao giờ đặt cho nhiều giấy tờ.' },
    },
    required: ['new_plate', 'new_number', 'new_date', 'new_stage', 'last_photo', 'current_plate', 'current_number', 'current_date', 'all_matching'],
    additionalProperties: false,
  },
};
