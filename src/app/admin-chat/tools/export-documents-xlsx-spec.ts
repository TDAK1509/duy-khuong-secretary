import type { ToolSpec } from '../../../services/chat/chat-service.ts';

const FILTER_PROPERTIES = {
  organization: {
    type: ['string', 'null'],
    description: 'Tên công ty hoặc nơi chốn, chép đúng từ list_organizations. null nếu không lọc theo tên.',
  },
  role: {
    type: ['string', 'null'],
    enum: ['issuer', 'supplier', 'customer', 'carrier', 'place', null],
    description: 'Vai trò của tên trên giấy tờ. null để chấp nhận mọi vai trò.',
  },
  stage: {
    type: ['string', 'null'],
    enum: ['dispatch', 'receipt', null],
    description: 'dispatch: lúc giao. receipt: lúc nhận. null nếu không lọc.',
  },
  kind: {
    type: ['string', 'null'],
    description: 'Loại giấy tờ đã lưu, ví dụ "phiếu cân xe". null để lấy mọi loại.',
  },
  plate: {
    type: ['string', 'null'],
    description: 'Biển số xe. null nếu không lọc theo xe.',
  },
  date_meaning: {
    type: ['string', 'null'],
    description: 'Ý nghĩa ngày dùng để lọc, chép từ list_document_numbers. null để dùng ngày trên giấy tờ.',
  },
  date_from: {
    type: ['string', 'null'],
    description: 'Từ ngày này, dạng YYYY-MM-DD, tính cả ngày này. null nếu không giới hạn.',
  },
  date_to: {
    type: ['string', 'null'],
    description: 'Đến hết ngày này, dạng YYYY-MM-DD. null nếu không giới hạn.',
  },
};

const FILTER_NAMES = Object.keys(FILTER_PROPERTIES);

export const EXPORT_DOCUMENTS_XLSX_SPEC: ToolSpec = {
  name: 'export_documents_xlsx',
  description:
    'Xuất danh sách giấy tờ đã chấp nhận phù hợp với bộ lọc ra file Excel (.xlsx). Mỗi dòng có dữ liệu giấy tờ và các kết quả kiến thức công ty đang áp dụng. Khi công cụ trả về ok, nhắn một câu tiếng Việt kèm đường dẫn và số lượng giấy tờ, ghi rõ "link có hiệu lực 24 giờ". Khi công cụ trả về no_matches, nói "<described_filter> không có giấy tờ nào, chưa tạo file Excel." Không dán nội dung giấy tờ vào tin nhắn. Quản lý có thể sửa giá trị trong ô, giữ nguyên dòng và cột, rồi gửi lại file cho Trợ lý để lưu các sửa đổi sau khi xác nhận.',
  parameters: {
    type: 'object',
    properties: FILTER_PROPERTIES,
    required: FILTER_NAMES,
    additionalProperties: false,
  },
};
