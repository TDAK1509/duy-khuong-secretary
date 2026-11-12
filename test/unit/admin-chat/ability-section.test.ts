import { describe, expect, it } from 'vitest';
import { buildAbilitySection } from '../../../src/app/admin-chat/ability-section.ts';
import { ADMIN_TOOLS } from '../../../src/app/admin-chat/tools/admin-tools.ts';

const INTRO = 'Khi người dùng hỏi bạn làm được gì, kể đúng các việc sau bằng lời ngắn gọn. Không kể việc ngoài danh sách này.';
const SAVING_LINE = '- Lưu ảnh giấy tờ và tin nhắn công việc mà người dùng gửi vào đây.';
const CHAT_LINE = '- Trò chuyện và trả lời câu hỏi về cách dùng Trợ lý.';

describe('the ability section of the prompt', () => {
  it('holds one ability line for each admin tool in tool-list order', () => {
    const section = buildAbilitySection(ADMIN_TOOLS);

    expect(section).toBe(
      [
        INTRO,
        SAVING_LINE,
        '- Tìm dữ liệu đã lưu mà người dùng được xem, theo từ khóa, loại, biển số và ngày.',
        '- Đếm số mục và cộng tiền theo loại trong một khoảng ngày gửi, trong phạm vi người dùng được xem.',
        '- Cho biết nhóm có những ai.',
        '- Tạo mã mời người mới vào nhóm.',
        '- Xóa một người khỏi nhóm.',
        '- Cho biết lần bảo dưỡng gần nhất của từng xe theo biển số.',
        '- Gửi lại ảnh gốc của dữ liệu đã lưu.',
        '- Đặt lịch tự động, ví dụ báo cáo hằng ngày hoặc nhắc bảo dưỡng.',
        '- Cho xem các lịch tự động đang chạy.',
        '- Hủy một lịch tự động.',
        '- Gửi danh sách tên công ty, nơi chốn gần giống nhau để quản lý xác nhận.',
        '- Cho biết giấy tờ có những loại số nào, ví dụ trọng lượng hoặc số tiền.',
        '- Cộng số tiền, trọng lượng hoặc số lượng trên giấy tờ theo công ty, loại giấy tờ, xe hoặc ngày.',
        '- Tìm đúng tên công ty và nơi chốn đã lưu.',
        CHAT_LINE,
      ].join('\n'),
    );
  });
});
