import type { ToolSpec } from '../../../services/chat/chat-service.ts';
import { AMOUNT_OUTCOME_NAMES } from '../../facts/knowledge-outcomes.ts';
import { FILTER_NAMES, FILTER_PROPERTIES, GROUP_BY } from './document-number-specs.ts';

export const TOTAL_COMPANY_KNOWLEDGE_SPEC: ToolSpec = {
  name: 'total_company_knowledge',
  description:
    'Tính tổng một kết quả số trong kiến thức công ty trên các giấy tờ đã chấp nhận và phù hợp, với cùng bộ lọc và cách chia nhóm như total_document_numbers. Lương tài xế và Chi phí bồi dưỡng là số tiền mỗi chuyến. Cước vận chuyển là giá mỗi tấn, nhân với trọng lượng hàng của từng chuyến (kg chia 1000). Mỗi chuyến tính một lần theo cùng cách ghép phiếu của báo cáo chuyến; nhiều chuyến cùng xe trong cùng ngày vẫn tính riêng, và phiếu lấy cùng phiếu đổ của một chuyến không cộng thêm. review_documents đếm giấy tờ đang chờ xem lại.',
  parameters: {
    type: 'object',
    properties: {
      value_name: { type: 'string', enum: [...AMOUNT_OUTCOME_NAMES], description: 'Kết quả kiến thức công ty cần tính.' },
      ...FILTER_PROPERTIES,
      group_by: GROUP_BY,
    },
    required: ['value_name', ...FILTER_NAMES, 'group_by'],
    additionalProperties: false,
  },
};
