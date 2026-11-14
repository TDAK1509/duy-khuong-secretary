import type { ToolSpec } from '../../services/chat/chat-service.ts';

export function buildAbilitySection(tools: ToolSpec[]): string {
  const toolLines = tools.map(({ name }) => `- ${findAbilityLine(name)}`);
  return [ABILITY_INTRO, SAVING_LINE, ...toolLines, CHAT_LINE].join('\n');
}

function findAbilityLine(toolName: string): string {
  const line = ABILITY_LINES[toolName];
  if (line === undefined) throw new Error(`the tool ${toolName} has no ability line`);
  return line;
}

const ABILITY_INTRO = 'Khi người dùng hỏi bạn làm được gì, kể đúng các việc sau bằng lời ngắn gọn. Không kể việc ngoài danh sách này.';
const SAVING_LINE = '- Lưu ảnh giấy tờ và tin nhắn công việc mà người dùng gửi vào đây.';
const CHAT_LINE = '- Trò chuyện và trả lời câu hỏi về cách dùng Trợ lý.';

const ABILITY_LINES: Record<string, string> = {
  search_records: 'Tìm dữ liệu đã lưu mà người dùng được xem, theo từ khóa, loại, biển số và ngày.',
  count_records: 'Đếm số mục và cộng tiền theo loại trong một khoảng ngày gửi, trong phạm vi người dùng được xem.',
  attach_photos: 'Gửi lại ảnh gốc của dữ liệu đã lưu.',
  list_sources: 'Cho biết dữ liệu lấy từ tin nhắn nào: ai gửi, lúc nào, ảnh hay tin nhắn, kèm nguyên văn.',
  remember: 'Ghi nhớ một điều người dùng muốn Trợ lý nhớ lâu dài.',
  forget: 'Quên một điều đã ghi nhớ khi người dùng bảo.',
  forget_all: 'Quên hết mọi điều đã ghi nhớ về người dùng.',
  list_members: 'Cho biết nhóm có những ai.',
  create_invite: 'Tạo mã mời người mới vào nhóm.',
  remove_member: 'Xóa một người khỏi nhóm.',
  list_member_facts: 'Cho biết các thông tin đã lưu về một người trong nhóm.',
  add_member_fact: 'Lưu thông tin về một người trong nhóm để đọc giấy tờ người đó gửi tốt hơn.',
  forget_member_fact: 'Xóa một thông tin đã lưu về một người trong nhóm.',
  forget_all_member_facts: 'Xóa mọi thông tin đã lưu về một người trong nhóm.',
  rewrite_member_plate: 'Đổi biển số xe cho toàn bộ dữ liệu đã lưu của một tài xế.',
  maintenance_status: 'Cho biết lần bảo dưỡng gần nhất của từng xe theo biển số.',
  create_scheduled_task: 'Đặt lịch tự động, ví dụ báo cáo hằng ngày hoặc nhắc bảo dưỡng.',
  list_scheduled_tasks: 'Cho xem các lịch tự động đang chạy của bạn hoặc của cả nhóm.',
  cancel_scheduled_task: 'Hủy một lịch tự động trong nhóm.',
  list_document_numbers: 'Cho biết giấy tờ có những loại số nào, ví dụ trọng lượng hoặc số tiền.',
  total_document_numbers: 'Cộng số tiền, trọng lượng hoặc số lượng trên giấy tờ theo công ty, loại giấy tờ, xe hoặc ngày.',
  list_organizations: 'Tìm đúng tên công ty và nơi chốn đã lưu.',
  list_merged_names: 'Cho biết các tên công ty, nơi chốn đã được tự gộp vào tên đã lưu.',
  split_merged_name: 'Tách một tên bị gộp sai thành một công ty hoặc nơi chốn riêng.',
  list_documents: 'Liệt kê các giấy tờ được tính trong một tổng số trên giấy tờ.',
};
