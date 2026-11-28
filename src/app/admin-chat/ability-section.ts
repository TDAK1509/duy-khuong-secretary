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
  correct_document: 'Sửa biển số, số giấy tờ, ngày, loại phiếu (lấy hàng hay đổ hàng), một giá trị in trên giấy (trọng lượng, hàng hóa, ghi chú) hoặc công ty (nơi lấy hàng, nơi đổ hàng, khách hàng) của giấy tờ đã lưu theo lời quản lý.',
  delete_document: 'Xóa hẳn một giấy tờ đã lưu theo lời quản lý; ảnh và tin nhắn gốc vẫn giữ nguyên.',
  list_company_knowledge: 'Cho biết kiến thức công ty đã lưu và số giấy tờ đang khớp.',
  update_company_knowledge: 'Sửa điều kiện hoặc kết quả của một kiến thức công ty đã lưu.',
  delete_company_knowledge: 'Xóa một kiến thức công ty đã lưu; giấy tờ vẫn giữ nguyên.',
  save_rule: 'Lưu một quy tắc của công ty, nguyên văn quản lý viết, để các quản lý trò chuyện và việc ghép phiếu trong báo cáo chuyến làm theo.',
  list_rules: 'Cho biết các quy tắc của công ty đã lưu và người lưu.',
  delete_rule: 'Xóa một quy tắc của công ty đã lưu.',
  total_company_knowledge: 'Cộng lương, cước vận chuyển hoặc chi phí bồi dưỡng từ kiến thức công ty theo xe, công ty, ngày hoặc tháng.',
  save_company_knowledge: 'Lưu kiến thức lâu dài của công ty với điều kiện áp dụng và kết quả.',
  propose_document_templates: 'Đề xuất mẫu giấy tờ của công ty từ các giấy tờ đã lưu, để giấy tờ tài xế gửi sau được đọc đúng hơn.',
  save_document_template: 'Lưu mẫu giấy tờ của công ty: loại giấy tờ, lấy hàng hay đổ hàng và các thông tin cần lưu.',
  list_document_templates: 'Cho biết các mẫu giấy tờ đã lưu của công ty.',
  delete_document_template: 'Xóa một mẫu giấy tờ; giấy tờ đã lưu vẫn giữ nguyên.',
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
  export_report_xlsx: 'Lưu một bảng báo cáo lớn thành file Excel và trả về đường dẫn tải xuống.',
  export_documents_xlsx: 'Xuất danh sách giấy tờ ra file Excel và trả về đường dẫn tải xuống.',
  export_trip_report_xlsx: 'Lập báo cáo chuyến hoặc chi phí chuyến ra file Excel, mỗi dòng một giấy tờ chuyến.',
};
