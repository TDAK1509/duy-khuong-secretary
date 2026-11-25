import type { ToolSpec } from '../../../services/chat/chat-service.ts';

export const CORRECT_DOCUMENT_SPEC: ToolSpec = {
  name: 'correct_document',
  description:
    'Sửa biển số, số giấy tờ, ngày, loại phiếu (lấy hàng hay đổ hàng) hoặc một giá trị in trên giấy (trọng lượng, hàng hóa, ghi chú) của giấy tờ đã lưu, theo lời quản lý. Dùng khi quản lý nói giá trị đúng của một giấy tờ đã lưu, ví dụ "số xe là 00X00002", "biển số trên ảnh là 00X00002", "đổi 00X00002 thành 00X00003", "ngày trên phiếu số 12345 là 02/11/2026", "trọng lượng hàng là 27.080 kg", "hàng hóa là than đá". Công cụ tự tìm giấy tờ đã lưu khớp, không cần list_documents hay search_records trước. Một giấy tờ khớp thì sửa ngay. Nhiều giấy tờ khớp mà không có all_matching thì chưa sửa gì và trả danh sách để hỏi quản lý. Giá trị in trên giấy chỉ sửa được cho đúng một giấy tờ: nhiều giấy tờ khớp thì chưa sửa gì và trả danh sách. Giá trị mới phải có trong chữ quản lý đã gõ, nếu không công cụ từ chối và chưa sửa gì. Cần ít nhất một giá trị mới và một cách chỉ ra giấy tờ.',
  parameters: {
    type: 'object',
    properties: {
      new_plate: { type: ['string', 'null'], description: 'Biển số đúng, chép đúng từ tin nhắn của quản lý, ví dụ 00X00002. Có thể có dấu chấm, gạch ngang hoặc khoảng trắng. null nếu không sửa biển số.' },
      new_number: { type: ['string', 'null'], description: 'Số giấy tờ đúng, chép đúng từ tin nhắn của quản lý. Chỉ đặt được cho một giấy tờ. null nếu không sửa số giấy tờ.' },
      new_date: { type: ['string', 'null'], description: 'Ngày đúng của giấy tờ, dạng YYYY-MM-DD. Ngày và tháng phải có trong tin nhắn của quản lý. null nếu không sửa ngày.' },
      new_stage: { type: ['string', 'null'], enum: ['dispatch', 'receipt', null], description: 'dispatch: phiếu lấy hàng, lúc hàng rời nơi lấy. receipt: phiếu đổ hàng, lúc hàng đến nơi đổ. null nếu không sửa.' },
      printed_label: { type: ['string', 'null'], description: 'Tên mục in trên giấy cần sửa, theo lời quản lý, ví dụ "Trọng lượng hàng", "Hàng hóa", "Ghi chú". Dùng cùng printed_value. null nếu không sửa giá trị in trên giấy.' },
      printed_value: { type: ['string', 'null'], description: 'Giá trị mới của mục đó, chép đúng từ tin nhắn của quản lý, ví dụ "27.080 kg" hoặc "than đá". null nếu không sửa giá trị in trên giấy.' },
      printed_meaning: { type: ['string', 'null'], description: 'Ý nghĩa của con số khi giá trị là một con số, ví dụ "Trọng lượng hàng". Trọng lượng của hàng luôn dùng đúng "Trọng lượng hàng". null nếu giá trị là chữ.' },
      printed_number: { type: ['number', 'null'], description: 'Con số của giá trị, đúng như quản lý gõ, không đổi đơn vị: "27.080 kg" là 27080, "27 tấn" là 27. null nếu giá trị là chữ.' },
      printed_unit: { type: ['string', 'null'], description: 'Đơn vị của con số, đúng như quản lý gõ, ví dụ "kg" hoặc "tấn". Công cụ tự đổi tấn ra kg. null nếu giá trị là chữ.' },
      last_photo: { type: 'boolean', description: 'true: giấy tờ trong ảnh quản lý gửi gần nhất trước tin nhắn này. Dùng khi quản lý nói "xe này", "phiếu này" hoặc chỉ nêu một biển số ngay sau khi gửi ảnh.' },
      current_plate: { type: ['string', 'null'], description: 'Biển số đang lưu trên giấy tờ cần sửa. null nếu không dùng cách này để chỉ ra giấy tờ.' },
      current_number: { type: ['string', 'null'], description: 'Số đang lưu trên giấy tờ cần sửa. null nếu không dùng cách này để chỉ ra giấy tờ.' },
      current_date: { type: ['string', 'null'], description: 'Ngày đang lưu trên giấy tờ cần sửa, dạng YYYY-MM-DD. null nếu không dùng cách này để chỉ ra giấy tờ.' },
      all_matching: { type: 'boolean', description: 'true chỉ khi quản lý nói rõ sửa mọi giấy tờ khớp, ví dụ "cả hai" hoặc "tất cả". Số giấy tờ mới không bao giờ đặt cho nhiều giấy tờ.' },
    },
    required: ['new_plate', 'new_number', 'new_date', 'new_stage', 'printed_label', 'printed_value', 'printed_meaning', 'printed_number', 'printed_unit', 'last_photo', 'current_plate', 'current_number', 'current_date', 'all_matching'],
    additionalProperties: false,
  },
};
