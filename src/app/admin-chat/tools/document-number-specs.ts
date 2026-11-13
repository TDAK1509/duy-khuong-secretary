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
    'Tính tổng, số giá trị, nhỏ nhất và lớn nhất của một ý nghĩa số trên các giấy tờ đã chấp nhận và phù hợp. Mỗi giấy tờ chỉ tính một lần dù có nhiều ảnh. Các đơn vị luôn tách riêng. review_documents đếm giấy tờ đang chờ xem lại. without_number đếm giấy tờ phù hợp nhưng không có số này. not_reread_messages đếm tin nhắn đã lưu nhưng chưa được đọc lại thành giấy tờ.',
  parameters: {
    type: 'object',
    properties: { meaning: MEANING, lines: LINES, ...FILTER_PROPERTIES, group_by: GROUP_BY },
    required: ['meaning', 'lines', ...FILTER_NAMES, 'group_by'],
    additionalProperties: false,
  },
};

export const LIST_DOCUMENT_NUMBERS_SPEC: ToolSpec = {
  name: 'list_document_numbers',
  description:
    'Liệt kê các ý nghĩa số và ý nghĩa ngày có trong các giấy tờ phù hợp, kèm loại (số hoặc ngày), đơn vị, số giấy tờ có số của cả giấy tờ và số giấy tờ có số theo từng dòng. Gọi trước total_document_numbers khi câu hỏi chưa nói rõ số nào hoặc ngày nào.',
  parameters: {
    type: 'object',
    properties: FILTER_PROPERTIES,
    required: FILTER_NAMES,
    additionalProperties: false,
  },
};

export const LIST_DOCUMENTS_SPEC: ToolSpec = {
  name: 'list_documents',
  description:
    'Liệt kê các giấy tờ được tính trong total_document_numbers với cùng meaning, lines và bộ lọc. Trả về id, loại, giao hoặc nhận, số giấy tờ, ngày trên giấy tờ, biển số, tóm tắt và các số được tính. Mỗi giấy tờ xuất hiện một lần. Tối đa 20 giấy tờ mỗi trang. Nếu next_cursor khác null, gọi lại với cursor đó. Dùng id với list_sources và attach_photos.',
  parameters: {
    type: 'object',
    properties: {
      meaning: { type: 'string', description: 'Ý nghĩa số cần xem nguồn, chép đúng từ yêu cầu total_document_numbers.' },
      lines: {
        type: 'string',
        enum: ['document', 'item'],
        description: 'document: số của cả giấy tờ. item: số của từng dòng hàng hoặc từng việc. Dùng đúng mức đã tính tổng.',
      },
      ...FILTER_PROPERTIES,
      cursor: { type: ['string', 'null'], description: 'Giá trị next_cursor của trang trước. null cho trang đầu.' },
    },
    required: ['meaning', 'lines', ...FILTER_NAMES, 'cursor'],
    additionalProperties: false,
  },
};

export const LIST_ORGANIZATIONS_SPEC: ToolSpec = {
  name: 'list_organizations',
  description:
    'Liệt kê các công ty và nơi chốn đã lưu trong nhóm: tên, loại, các cách viết đã gặp và số giấy tờ. Lọc theo text nếu có. Trả về tối đa 50 tên mỗi trang, theo thứ tự tên. Nếu next_cursor khác null, gọi lại với cursor đó để đọc trang tiếp theo.',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: ['string', 'null'],
        description: 'Một phần tên cần tìm, không phân biệt dấu và chữ hoa. null để lấy tất cả.',
      },
      cursor: {
        type: ['string', 'null'],
        description: 'Giá trị next_cursor của trang trước. null cho trang đầu. Giữ nguyên text khi xem trang tiếp theo.',
      },
    },
    required: ['text', 'cursor'],
    additionalProperties: false,
  },
};
