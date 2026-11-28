import type { ToolSpec } from '../../../services/chat/chat-service.ts';

export const LIST_EDITED_EXPORT_CHANGES_SPEC: ToolSpec = {
  name: 'list_edited_export_changes',
  description:
    'Liệt kê các ô đã đổi trong file Excel do Trợ lý xuất mà quản lý vừa gửi lại. Mỗi thay đổi có change_id, dòng, cột, giá trị cũ, giá trị mới, giấy tờ và kiến thức đã tạo giá trị cũ, nguyên nhân đề xuất, các việc có thể làm (candidate_actions) và trạng thái. Chỉ liệt kê; chưa sửa hay lưu gì.',
  parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
};
