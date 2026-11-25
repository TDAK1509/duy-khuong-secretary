import type { ToolSpec } from '../../../services/chat/chat-service.ts';

const SAVE_RULE_SPEC: ToolSpec = {
  name: 'save_rule',
  description:
    'Lưu một quy tắc của công ty: một yêu cầu lâu dài của quản lý về cách làm việc, ví dụ "xe lấy hàng ở A chỉ đổ ở B". Không có tham số: máy chủ lưu nguyên văn tin nhắn hiện tại của quản lý, tối đa 1000 ký tự, nên ảnh hay giấy tờ không bao giờ thành quy tắc. Tối đa 50 quy tắc. Quy tắc được dùng khi các quản lý trò chuyện với Trợ lý và khi ghép phiếu lấy hàng với phiếu đổ hàng trong báo cáo chuyến. Quy tắc không dùng khi đọc ảnh và không đổi giấy tờ đã lưu.',
  parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
};

const LIST_RULES_SPEC: ToolSpec = {
  name: 'list_rules',
  description: 'Liệt kê các quy tắc của công ty đã lưu bằng save_rule, cũ nhất trước. Mỗi quy tắc có id, nguyên văn và tên người lưu.',
  parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
};

const DELETE_RULE_SPEC: ToolSpec = {
  name: 'delete_rule',
  description: 'Xóa hẳn một quy tắc của công ty, theo id lấy từ list_rules. Không hoàn tác được.',
  parameters: {
    type: 'object',
    properties: { rule_id: { type: 'string', description: 'id của quy tắc cần xóa, lấy từ list_rules.' } },
    required: ['rule_id'],
    additionalProperties: false,
  },
};

export const WORKSPACE_RULE_TOOLS: ToolSpec[] = [SAVE_RULE_SPEC, LIST_RULES_SPEC, DELETE_RULE_SPEC];
