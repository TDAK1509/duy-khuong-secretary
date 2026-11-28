import type { ToolSpec } from '../../../services/chat/chat-service.ts';
import { FILTER_NAMES, FILTER_PROPERTIES, GROUP_BY } from './document-number-specs.ts';

export const TOTAL_FACT_VALUES_SPEC: ToolSpec = {
  name: 'total_fact_values',
  description:
    'Tính tổng một giá trị quản lý đã lưu bằng save_fact (ví dụ lương tài xế, cước vận chuyển, chi phí bồi dưỡng, khách hàng) trên các giấy tờ đã chấp nhận và phù hợp, với cùng bộ lọc và cách chia nhóm như total_document_numbers. Mỗi chuyến tính một lần theo cùng cách ghép phiếu của báo cáo chuyến; nhiều chuyến cùng xe trong cùng ngày vẫn tính riêng, và phiếu lấy cùng phiếu đổ của một chuyến không cộng thêm. amounts: số tiền mỗi chuyến, cộng lại. per_ton: giá mỗi tấn, nhân với trọng lượng hàng của từng chuyến (kg chia 1000). texts: giá trị chữ, đếm số chuyến. review_documents đếm giấy tờ đang chờ xem lại.',
  parameters: {
    type: 'object',
    properties: {
      value_name: { type: 'string', description: 'Tên giá trị như đã lưu, ví dụ "Lương tài xế". Không phân biệt dấu.' },
      ...FILTER_PROPERTIES,
      group_by: GROUP_BY,
    },
    required: ['value_name', ...FILTER_NAMES, 'group_by'],
    additionalProperties: false,
  },
};
