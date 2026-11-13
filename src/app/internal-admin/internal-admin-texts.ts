export const LOGIN_CODE_EXPLANATION =
  'Mã đăng nhập trang quản trị Trợ lý ở tin nhắn tiếp theo. Nhấn giữ tin nhắn đó để sao chép, rồi dán vào trang quản trị. Mã hết hạn sau 10 phút. Không đưa mã này cho ai, kể cả người nói là của Trợ lý.';
export const NOT_INTERNAL_TEXT = 'Bạn không có quyền vào trang quản trị Trợ lý.';
import type { LlmCallKind } from '../credits/llm-call-kind.ts';

export const ADMIN_TITLE = 'Trang quản trị Trợ lý';
export const LOGIN_INTRO = 'Trang này chỉ dành cho người vận hành Trợ lý.';
export const LOGIN_STEP_OPEN_CHAT = '1. Mở khung chat với Trợ lý trong Zalo.';
export const LOGIN_STEP_SEND_COMMAND = '2. Nhắn: đăng nhập quản trị';
export const LOGIN_STEP_COPY_CODE = '3. Trợ lý gửi mã trong một tin nhắn riêng. Sao chép mã rồi dán vào ô dưới đây.';
export const LOGIN_STEP_SUBMIT = '4. Bấm "Đăng nhập".';
export const CODE_FIELD_LABEL = 'Mã đăng nhập';
export const LOGIN_BUTTON_LABEL = 'Đăng nhập';
export const WRONG_CODE_TEXT = 'Mã không đúng hoặc đã hết hạn. Nhắn "đăng nhập quản trị" cho Trợ lý để lấy mã mới.';
export const TOO_MANY_LOGINS_TEXT = 'Có quá nhiều lần nhập mã. Thử lại sau 10 phút.';
export const BALANCE_AND_USAGE_HEADING = 'Số dư và mức dùng';
export const WORKSPACE_COLUMN = 'Nhóm';
export const BALANCE_COLUMN = 'Số dư';
export const TODAY_COLUMN = 'Hôm nay';
export const LAST_WEEK_COLUMN = '7 ngày qua';
export const LAST_MONTH_COLUMN = '30 ngày qua';
export const USAGE_BY_KIND_HEADING = 'Mức dùng theo loại, 7 ngày qua';
export const KIND_COLUMN = 'Loại';
export const CALLS_COLUMN = 'Số lần gọi';
export const CREDITS_COLUMN = 'Credit';
export const COST_COLUMN = 'Chi phí';

export const KIND_LABELS: Record<LlmCallKind, string> = {
  photo_read: 'Đọc ảnh',
  text_read: 'Đọc tin nhắn',
  chat_answer: 'Trả lời chat',
  scheduled_run: 'Lịch',
  chatgpt_text_save: 'Lưu từ ChatGPT',
  operator_reread: 'Đọc lại (vận hành)',
  operator_backfill: 'Bổ sung số (vận hành)',
};
export const DRIFT_WARNING = 'Số dư không khớp với lịch sử credit.';
export const EMPTY_TABLE_TEXT = 'Chưa có dữ liệu.';
export const HISTORY_HEADING_PREFIX = 'Lịch sử credit: ';
export const TIME_COLUMN = 'Thời gian';
export const ADDER_COLUMN = 'Người nạp';
export const NOTE_COLUMN = 'Ghi chú';
export const BALANCE_AFTER_COLUMN = 'Số dư sau';
export const BACK_LINK_TEXT = 'Quay lại trang quản trị';
export const STARTING_GRANT_ADDER = 'Tặng khi bắt đầu';
export const WORKSPACE_NOT_FOUND_TEXT = 'Không tìm thấy nhóm này.';

export const SOURCE_LABELS = {
  starting_grant: 'Nạp: tặng khi bắt đầu',
  internal_user: 'Nạp: người vận hành',
};
export const INVALID_SESSION_TEXT = 'Phiên đăng nhập không hợp lệ. Tải lại trang rồi thử lại.';
export const CREDITS_INVALID_TEXT = 'Số credit phải là số nguyên từ 1 đến 1.000.000.';
export const NOTE_INVALID_TEXT = 'Ghi chú không được để trống và dài tối đa 500 ký tự.';
export const RECENT_ADDITIONS_HEADING = 'Các lần nạp gần đây';
export const ADD_CREDITS_HEADING = 'Nạp credit';
export const WORKSPACE_FIELD_LABEL = 'Nhóm';
export const CREDITS_FIELD_LABEL = 'Số credit';
export const NOTE_FIELD_LABEL = 'Ghi chú';
export const ADD_CREDITS_BUTTON_LABEL = 'Nạp credit';
