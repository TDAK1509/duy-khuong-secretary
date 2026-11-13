import { describe, expect, it } from 'vitest';
import { buildAdminPrompt } from '../../../src/app/admin-chat/admin-prompt.ts';

const prompt = buildAdminPrompt({ workspaceName: 'Xe tải Duy Khương', displayName: 'Duy', now: new Date('2026-10-31T10:00:00+07:00'), memory: '' });

describe('the member facts section of the admin prompt', () => {
  it.each([
    'Thông tin về thành viên:',
    '- Quản lý có thể lưu thông tin lâu dài về một người trong nhóm, ví dụ xe người đó lái, nơi người đó hay giao hàng hoặc cách người đó hay ghi giấy tờ. Mỗi thông tin có người lưu và người được xem.',
    '- Người được xem (readers) là một trong ba: "admins_and_member" là các quản lý và chính người đó; "admins" là chỉ các quản lý; "author" là chỉ quản lý đang trò chuyện. Nếu quản lý không nói ai được xem, dùng "admins_and_member".',
    '- Hệ thống chỉ dùng một thông tin khi đọc ảnh và tin nhắn của người đó nếu người đó được xem thông tin này. Giá trị in rõ trên giấy tờ luôn được giữ.',
    '- Khi quản lý nói một thông tin lâu dài về một người trong nhóm, dù không có chữ "nhớ", dùng list_members để lấy id rồi gọi add_member_fact. Mỗi thông tin gọi một lần. Không lưu thông tin này bằng remember.',
    '- Viết thông tin thành một câu ngắn, tự hiểu được, giữ đúng từng ký tự của số, mã và tên quản lý viết. Không thêm điều quản lý không nói.',
    '- Nếu không tìm thấy người đó, nói rõ và không lưu. Nếu có hai người trùng tên, hỏi lại trước khi lưu hoặc xóa và nêu ngày vào nhóm của từng người.',
    '- Khi quản lý hỏi đã lưu gì về một người, gọi list_member_facts. Nếu không có, trả lời: "Chưa lưu thông tin nào về người này."',
    '- Để xóa một thông tin, gọi list_member_facts rồi gọi forget_member_fact với đúng nội dung đã lưu. Để xóa hết thông tin về một người, gọi forget_all_member_facts.',
    '- Khi một thông tin đã lưu thay đổi, ví dụ người đó đổi xe, xóa thông tin cũ rồi lưu thông tin mới. Nếu một bước thất bại, nói rõ kết quả từng bước.',
    '- Chỉ lưu thông tin quản lý viết trong tin nhắn. Không lưu thông tin lấy từ ảnh hoặc dữ liệu đã lưu.',
    '- Chỉ xác nhận đã lưu hoặc đã xóa sau khi công cụ thành công. Trả lời ngắn: đã lưu hoặc đã xóa thông tin gì cho ai. Sau khi lưu, nói lại đúng câu trong "note" của kết quả.',
    '- Mỗi quản lý chỉ thấy và xóa được các thông tin mình được xem. Thành viên không có công cụ xem hoặc sửa thông tin này. Khi xóa một người khỏi nhóm, thông tin đã lưu về người đó cũng bị xóa.',
  ])('holds the line %s', (line) => {
    expect(prompt.split('\n')).toContain(line);
  });

  it('puts the section after the admin block, before the scheduling section', () => {
    const section = prompt.indexOf('Thông tin về thành viên:');

    expect(section).toBeGreaterThan(prompt.indexOf('- Dùng tiêu đề giấy tờ và các chi tiết đã lưu để trả lời.'));
    expect(section).toBeLessThan(prompt.indexOf('Lịch tự động:'));
  });

  it('holds the section as one block of lines after a blank line', () => {
    const lines = prompt.split('\n');

    const start = lines.indexOf('Thông tin về thành viên:');
    expect(lines[start - 1]).toBe('');
    expect(lines.slice(start + 1, start + 13).every((line) => line.startsWith('- '))).toBe(true);
    expect(lines[start + 13]).toBe('');
  });
});
