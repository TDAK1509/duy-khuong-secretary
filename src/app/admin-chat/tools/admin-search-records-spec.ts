import type { ToolSpec } from '../../../services/chat/chat-service.ts';
import type { JsonSchema } from '../../../services/reading/reader-service.ts';
import { SEARCH_RECORDS_SPEC } from './tool-specs.ts';

const DESCRIPTION =
  'Tìm dữ liệu đã lưu trong nhóm. Lọc được theo ngày gửi và ngày trên giấy tờ. Trả về tối đa 50 mục mỗi trang, mới nhất trước. Nếu next_cursor khác null, gọi lại với cursor đó để đọc trang tiếp theo.';

const OCCURRED_FROM = {
  type: ['string', 'null'],
  description: 'Lấy mục có ngày công việc trên giấy tờ từ ngày này, dạng YYYY-MM-DD, tính cả ngày này. Mục thiếu ngày bị loại. null nếu không giới hạn.',
};

const OCCURRED_TO = {
  type: ['string', 'null'],
  description: 'Lấy mục có ngày công việc trên giấy tờ đến hết ngày này, dạng YYYY-MM-DD. Mục thiếu ngày bị loại. null nếu không giới hạn.',
};

export const ADMIN_SEARCH_RECORDS_SPEC: ToolSpec = {
  ...SEARCH_RECORDS_SPEC,
  description: DESCRIPTION,
  parameters: addDocumentDateParameters(SEARCH_RECORDS_SPEC.parameters),
};

function addDocumentDateParameters(parameters: JsonSchema): JsonSchema {
  const { cursor, ...properties } = parameters['properties'] as Record<string, unknown>;
  const required = (parameters['required'] as string[]).filter((name) => name !== 'cursor');
  return {
    ...parameters,
    properties: { ...properties, occurred_from: OCCURRED_FROM, occurred_to: OCCURRED_TO, cursor },
    required: [...required, 'occurred_from', 'occurred_to', 'cursor'],
  };
}
