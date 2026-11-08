import type { ToolSpec } from '../../../services/chat/chat-service.ts';
import { ADMIN_SEARCH_RECORDS_SPEC } from './admin-search-records-spec.ts';

const PLATE = (ADMIN_SEARCH_RECORDS_SPEC.parameters['properties'] as Record<string, unknown>)['plate'];

const FILTER_PROPERTIES = {
  organization: {
    type: ['string', 'null'],
    description: 'Tên công ty hoặc nơi chốn, chép đúng từ list_organizations. null nếu không lọc theo tên.',
  },
  role: {
    type: ['string', 'null'],
    enum: ['issuer', 'supplier', 'customer', 'carrier', 'place', null],
    description:
      'Vai trò của tên trên giấy tờ. issuer: bên phát hành. supplier: bên bán. customer: bên nhận hàng hoặc mua hàng. carrier: bên vận chuyển. place: nơi chốn. null để chấp nhận mọi vai trò.',
  },
  stage: {
    type: ['string', 'null'],
    enum: ['dispatch', 'receipt', null],
    description: 'dispatch: giấy tờ lúc hàng rời nơi giao. receipt: giấy tờ lúc hàng đến nơi nhận. null nếu không lọc.',
  },
  kind: {
    type: ['string', 'null'],
    description: 'Loại giấy tờ đã lưu, ví dụ "phiếu cân xe". null để lấy mọi loại.',
  },
  plate: PLATE,
  date_meaning: {
    type: ['string', 'null'],
    description: 'Ý nghĩa ngày dùng để lọc và chia nhóm, chép từ list_document_numbers. null để dùng ngày trên giấy tờ.',
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

const MEANING = {
  type: 'string',
  description: 'Ý nghĩa số cần tính, chép đúng từ list_document_numbers.',
};

const LINES = {
  type: 'string',
  enum: ['document', 'item'],
  description: 'document: chỉ tính số của cả giấy tờ. item: chỉ tính số của từng dòng hàng hoặc từng việc.',
};

const GROUP_BY = {
  type: 'string',
  enum: ['none', 'organization', 'kind', 'plate', 'stage', 'day', 'month'],
  description:
    'none: không chia nhóm. organization: theo tên công ty hoặc nơi chốn ở vai trò đã lọc. kind: theo loại giấy tờ. plate: theo xe. stage: theo giao hoặc nhận. day: theo ngày. month: theo tháng.',
};

export const TOTAL_DOCUMENT_NUMBERS_SPEC: ToolSpec = {
  name: 'total_document_numbers',
  description:
    'Tính tổng, số giá trị, nhỏ nhất và lớn nhất của một ý nghĩa số trên các giấy tờ đã chấp nhận và phù hợp. Mỗi giấy tờ chỉ tính một lần dù có nhiều ảnh. Các đơn vị luôn tách riêng. Chỉ tính tên đã xác nhận. pending_name_documents đếm giấy tờ bị bỏ qua vì tên đang chờ xác nhận. review_documents đếm giấy tờ đang chờ xem lại. without_number đếm giấy tờ phù hợp nhưng không có số này. not_reread_messages đếm tin nhắn đã lưu nhưng chưa được đọc lại thành giấy tờ.',
  parameters: {
    type: 'object',
    properties: { meaning: MEANING, lines: LINES, ...FILTER_PROPERTIES, group_by: GROUP_BY },
    required: ['meaning', 'lines', ...FILTER_NAMES, 'group_by'],
    additionalProperties: false,
  },
};
