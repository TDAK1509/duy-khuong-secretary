import type { ToolSpec } from '../../../services/chat/chat-service.ts';
import { KNOWLEDGE_PROPERTIES, KNOWLEDGE_PROPERTY_NAMES } from './company-knowledge-properties.ts';

export const SAVE_COMPANY_KNOWLEDGE_SPEC: ToolSpec = {
  name: 'save_company_knowledge',
  description:
    'Lưu một kiến thức lâu dài của công ty với điều kiện when và kết quả then. Điều kiện có thể gồm hàng hóa, nơi lấy hàng, nơi đổ hàng, biển số và tài xế. Kết quả có thể gồm khách hàng, nơi đổ hàng, tên hàng hiển thị, lương tài xế, cước vận chuyển theo tấn, chi phí bồi dưỡng, khối lượng lấy hàng bằng khối lượng đổ hàng và ghi chú. Tên công ty trong điều kiện nơi lấy hàng hoặc nơi đổ hàng khớp khi giấy tờ đã chấp nhận in ít nhất một tên đó ở bất kỳ vai trò nào; giấy tờ có nhiều dòng hàng vẫn được xét. Khách hàng chỉ đặt trong then. Nơi đổ hàng của một tuyến là điều kiện when_dropoff_company; chỉ dùng then_dropoff khi nơi đổ hàng là kết quả của các điều kiện khác. Nếu đã có mục cùng mọi điều kiện when, công cụ cập nhật kết quả của mục đó (action "updated"); nếu không thì lưu mục mới (action "added"); nếu có nhiều mục có thể khớp thì không đổi gì (action "ambiguous"). Lưu xong trả về số giấy tờ khớp. Cần ít nhất một điều kiện when hoặc một ghi chú (then_note); mục chỉ có ghi chú và không có điều kiện áp dụng cho cả công ty. Tối đa 100 mục mỗi nhóm. Kết quả có example_documents: tối đa 3 giấy tờ khớp, mới nhất trước. Trước khi lưu, công cụ tìm mục có điều kiện chồng lấp nhưng kết quả khác (action "conflict") và các ghi chú có điều kiện chồng lấp (action "check_notes"); khi đó chưa đổi gì.',
  parameters: {
    type: 'object',
    properties: {
      ...KNOWLEDGE_PROPERTIES,
      entry_id: {
        type: ['string', 'null'],
        description: 'Chỉ dùng sau khi save_company_knowledge trả về action "ambiguous" và quản lý đã chọn một mục: entry_id của mục đó. Còn lại để null.',
      },
    },
    required: ['statement', 'entry_id', ...KNOWLEDGE_PROPERTY_NAMES.filter((name) => name !== 'statement')],
    additionalProperties: false,
  },
};
