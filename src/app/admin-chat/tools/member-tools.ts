import type { ToolSpec } from '../../../services/chat/chat-service.ts';
import type { JsonSchema } from '../../../services/reading/reader-service.ts';
import { ADMIN_SEARCH_RECORDS_SPEC } from './admin-search-records-spec.ts';
import { ATTACH_PHOTOS_SPEC, COUNT_RECORDS_SPEC, LIST_SOURCES_SPEC } from './tool-specs.ts';

const SEARCH_RECORDS_DESCRIPTION =
  'Tìm dữ liệu do chính bạn gửi trong nhóm hiện tại. Lọc theo ngày gửi hoặc ngày trên giấy tờ. Tối đa 50 mục mỗi trang, mới nhất trước. Nếu next_cursor khác null, dùng cursor đó để xem tiếp.';

const SEARCH_MEMBER_DESCRIPTION = 'Luôn là null. Công cụ chỉ tìm dữ liệu do chính bạn gửi.';

const COUNT_RECORDS_DESCRIPTION =
  'Đếm chính xác số mục và cộng tiền theo từng loại trong khoảng ngày gửi. Chỉ tính dữ liệu do chính bạn gửi.';

const ATTACH_PHOTOS_DESCRIPTION =
  'Gửi ảnh gốc của dữ liệu do chính bạn gửi, ngay sau câu trả lời. Lấy record_ids từ search_records. Tối đa 4 ảnh. Bỏ qua mục không có ảnh hoặc không được phép xem.';

const LIST_SOURCES_DESCRIPTION =
  'Tìm tin gốc của dữ liệu do chính bạn gửi: gửi lúc nào (giờ Việt Nam), gửi ảnh hay tin nhắn, và ngày trên giấy tờ. Lấy record_ids từ search_records. Tối đa 5 tin gốc mỗi lần gọi, theo thứ tự id. Hệ thống tự gửi một thẻ nguồn có nguyên văn tin nhắn cho mỗi tin gốc ngay sau câu trả lời. left_out đếm số id không có trong kết quả.';

const MEMBER_SEARCH_RECORDS_SPEC: ToolSpec = {
  ...ADMIN_SEARCH_RECORDS_SPEC,
  description: SEARCH_RECORDS_DESCRIPTION,
  parameters: describeMemberParameter(ADMIN_SEARCH_RECORDS_SPEC.parameters),
};

function describeMemberParameter(parameters: JsonSchema): JsonSchema {
  const properties = parameters['properties'] as Record<string, object>;
  return { ...parameters, properties: { ...properties, member: { ...properties['member'], description: SEARCH_MEMBER_DESCRIPTION } } };
}

export const MEMBER_TOOLS: ToolSpec[] = [
  MEMBER_SEARCH_RECORDS_SPEC,
  { ...COUNT_RECORDS_SPEC, description: COUNT_RECORDS_DESCRIPTION },
  { ...ATTACH_PHOTOS_SPEC, description: ATTACH_PHOTOS_DESCRIPTION },
  { ...LIST_SOURCES_SPEC, description: LIST_SOURCES_DESCRIPTION },
];
