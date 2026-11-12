import { describe, expect, it } from 'vitest';
import { formatJoinResult } from '../../../src/app/processing/conversation-texts.ts';

describe('the reply to a person who joined', () => {
  it('ends the reply to a new member with the joined-member hint', () => {
    const reply = formatJoinResult({ kind: 'joined', workspaceName: 'Xe tải Duy Khương', displayName: 'Hùng', role: 'member', inviter: null });

    expect(reply.endsWith('Từ giờ bạn gửi ảnh hóa đơn, phiếu giao nhận hoặc giấy tờ bảo dưỡng vào đây để lưu nhé. Bạn cũng có thể hỏi Trợ lý về dữ liệu mình đã gửi, hoặc hỏi "Bạn làm được gì?".')).toBe(true);
  });

  it('ends the reply to a new admin with the joined-admin hint', () => {
    const reply = formatJoinResult({ kind: 'joined', workspaceName: 'Xe tải Duy Khương', displayName: 'Duy', role: 'admin', inviter: null });

    expect(reply.endsWith('Bạn có thể hỏi Trợ lý về dữ liệu của nhóm, mời hoặc xóa thành viên và đặt lịch tự động. Hỏi "Bạn làm được gì?" để xem đủ.')).toBe(true);
  });
});
