import type { ChangeTool } from './tools/admin-text-guard.ts';

export const CHAT_FAILURE_TEXT = 'Xin lỗi, hệ thống đang bận. Bạn gửi lại sau ít phút nhé.';

export const TOOL_LOOP_TEXT = 'Xin lỗi, yêu cầu này cần tra cứu quá nhiều lần nên tôi chưa làm xong việc nào. Bạn chia nhỏ giúp tôi theo từng xe, từng tuần hoặc từng công ty, rồi gửi lại từng phần nhé.';

const CHANGE_TOOL_LABELS: Record<ChangeTool, string> = {
  create_scheduled_task: 'đặt lịch',
  cancel_scheduled_task: 'hủy lịch',
  create_invite: 'mời người',
  remove_member: 'xóa người',
  add_member_fact: 'lưu thông tin về thành viên',
  forget_member_fact: 'xóa thông tin về thành viên',
  forget_all_member_facts: 'xóa mọi thông tin về thành viên',
  remember: 'ghi nhớ',
  forget: 'quên điều đã ghi nhớ',
  forget_all: 'quên mọi điều đã ghi nhớ',
  split_merged_name: 'tách tên đã gộp',
  rewrite_member_plate: 'đổi biển số của tài xế',
  save_fact: 'lưu thông tin cố định về chuyến',
  update_fact: 'sửa thông tin cố định về chuyến',
  delete_fact: 'xóa thông tin cố định về chuyến',
  save_document_template: 'lưu mẫu giấy tờ',
  delete_document_template: 'xóa mẫu giấy tờ',
};

export function buildChangeRefusedNotice(refusedTools: ChangeTool[]): string {
  const actions = refusedTools.map((tool) => CHANGE_TOOL_LABELS[tool]).join(', ');
  return `Tôi chưa ${actions} vì tin nhắn này đi kèm dữ liệu đọc từ ảnh, hoặc tôi đã đọc dữ liệu do thành viên gửi.
Nếu bạn vẫn muốn, hãy gửi lại riêng yêu cầu đó, không kèm ảnh.`;
}
