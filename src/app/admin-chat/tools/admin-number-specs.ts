import type { ToolSpec } from '../../../services/chat/chat-service.ts';
import { ADMIN_SEARCH_RECORDS_SPEC } from './admin-search-records-spec.ts';

const FILTER_NAMES = ['text', 'category', 'member', 'plate', 'added_from', 'added_to', 'occurred_from', 'occurred_to'];

const FILTER_PROPERTIES = pickFilterProperties(ADMIN_SEARCH_RECORDS_SPEC.parameters['properties'] as Record<string, unknown>);

function pickFilterProperties(searchProperties: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(FILTER_NAMES.map((name) => [name, searchProperties[name]]));
}

const LABEL = {
  type: 'string',
  description: 'Nhãn chi tiết cần tính, chép từ list_number_labels. Không phân biệt dấu, chữ hoa hoặc khoảng trắng thừa. Không tự đổi hoặc gộp nhãn.',
};

const GROUP_BY = {
  type: 'string',
  enum: ['none', 'member', 'plate', 'category', 'occurred_on'],
  description: 'none: không chia nhóm. member: theo thành viên. plate: theo xe. category: theo loại. occurred_on: theo ngày trên giấy tờ.',
};

export const TOTAL_NUMBERS_SPEC: ToolSpec = {
  name: 'total_numbers',
  description:
    'Tính tổng, số giá trị, nhỏ nhất và lớn nhất dưới một nhãn trong mọi mục phù hợp. Các đơn vị luôn tách riêng. Lọc giống search_records, không phân trang. Có thể nhóm theo thành viên, xe, loại hoặc ngày trên giấy tờ. Các kết quả tổng, nhỏ nhất và lớn nhất là chuỗi số thập phân. without_number đếm mục có nhãn này nhưng thiếu số chuẩn.',
  parameters: {
    type: 'object',
    properties: { label: LABEL, ...FILTER_PROPERTIES, group_by: GROUP_BY },
    required: ['label', ...FILTER_NAMES, 'group_by'],
    additionalProperties: false,
  },
};
