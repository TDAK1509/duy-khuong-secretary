import { describe, expect, it } from 'vitest';
import { buildAbilitySection } from '../../../src/app/admin-chat/ability-section.ts';
import { ADMIN_TOOLS } from '../../../src/app/admin-chat/tools/admin-tools.ts';
import { MEMBER_TOOLS } from '../../../src/app/admin-chat/tools/member-tools.ts';
import { MEMORY_TOOLS } from '../../../src/app/admin-chat/tools/memory-tools.ts';

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
        '- Cho biết dữ liệu lấy từ tin nhắn nào: ai gửi, lúc nào, ảnh hay tin nhắn, kèm nguyên văn.',
        '- Đặt lịch tự động, ví dụ báo cáo hằng ngày hoặc nhắc bảo dưỡng.',
        '- Cho xem các lịch tự động đang chạy.',
        '- Hủy một lịch tự động.',
        '- Gửi danh sách tên công ty, nơi chốn gần giống nhau để quản lý xác nhận.',
        '- Cho biết giấy tờ có những loại số nào, ví dụ trọng lượng hoặc số tiền.',
        '- Cộng số tiền, trọng lượng hoặc số lượng trên giấy tờ theo công ty, loại giấy tờ, xe hoặc ngày.',
        '- Tìm đúng tên công ty và nơi chốn đã lưu.',
        '- Liệt kê các giấy tờ được tính trong một tổng số trên giấy tờ.',
        CHAT_LINE,
      ].join('\n'),
    );
  });

  it('holds the seven member lines and the two fixed lines for the member tools', () => {
    const section = buildAbilitySection([...MEMBER_TOOLS, ...MEMORY_TOOLS]);

    expect(section).toBe(
      [
        INTRO,
        SAVING_LINE,
        '- Tìm dữ liệu đã lưu mà người dùng được xem, theo từ khóa, loại, biển số và ngày.',
        '- Đếm số mục và cộng tiền theo loại trong một khoảng ngày gửi, trong phạm vi người dùng được xem.',
        '- Gửi lại ảnh gốc của dữ liệu đã lưu.',
        '- Cho biết dữ liệu lấy từ tin nhắn nào: ai gửi, lúc nào, ảnh hay tin nhắn, kèm nguyên văn.',
        '- Ghi nhớ một điều người dùng muốn Trợ lý nhớ lâu dài.',
        '- Quên một điều đã ghi nhớ khi người dùng bảo.',
        '- Quên hết mọi điều đã ghi nhớ về người dùng.',
        CHAT_LINE,
      ].join('\n'),
    );
  });

  it('throws an error that names a tool with no ability line', () => {
    const unknownTool = { name: 'unknown_tool', description: '', parameters: {} };

    expect(() => buildAbilitySection([unknownTool])).toThrow('unknown_tool');
  });
});
