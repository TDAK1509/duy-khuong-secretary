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

export const LIST_NUMBER_LABELS_SPEC: ToolSpec = {
  name: 'list_number_labels',
  description:
    'Liệt kê các nhãn chi tiết trong các mục phù hợp, kèm đơn vị và số giá trị. unit là null khi giá trị chưa có cặp số và đơn vị hợp lệ. Một nhãn có thể có các dòng có đơn vị và một dòng có unit là null. Lọc giống search_records. Gọi trước total_numbers khi chưa biết nhãn. Không tự coi hai nhãn khác nghĩa là một.',
  parameters: {
    type: 'object',
    properties: FILTER_PROPERTIES,
    required: FILTER_NAMES,
    additionalProperties: false,
  },
};

export const TOTAL_NUMBERS_SPEC: ToolSpec = {
  name: 'total_numbers',
  description:
    'Tính tổng, số giá trị, nhỏ nhất và lớn nhất dưới một nhãn trong các mục phù hợp. Các bản lưu trùng loại, số chứng từ, biển số và ngày trên giấy tờ chỉ lấy bản mới nhất có nhãn đó trong các mục phù hợp. Mục không có số chứng từ luôn tính riêng. Các đơn vị luôn tách riêng. Lọc giống search_records, không phân trang. Có thể nhóm theo thành viên, xe, loại hoặc ngày trên giấy tờ. Các kết quả tổng, nhỏ nhất và lớn nhất là chuỗi số thập phân. without_number đếm mục được chọn có nhãn này nhưng thiếu số chuẩn.',
  parameters: {
    type: 'object',
    properties: { label: LABEL, ...FILTER_PROPERTIES, group_by: GROUP_BY },
    required: ['label', ...FILTER_NAMES, 'group_by'],
    additionalProperties: false,
  },
};
