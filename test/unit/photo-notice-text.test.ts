import { describe, expect, it } from 'vitest';
import { formatPhotoNotice } from '../../src/app/intake/intake-texts.ts';

describe('formatPhotoNotice', () => {
  it('names the sender, the group, the time and the reply the sender got', () => {
    const text = formatPhotoNotice({
      senderName: 'Hùng',
      workspaceName: 'Xe tải Duy Khương',
      sentAt: new Date('2026-11-02T10:00:00+07:00'),
      replyText: 'Đã lưu: Đổ xăng dầu, số 0001234, 1.250.000đ, ngày 30/10/2026.',
    });

    expect(text).toBe(
      'Hùng gửi ảnh vào nhóm "Xe tải Duy Khương" lúc 10:00 02/11/2026.\nTrợ lý đã trả lời Hùng:\nĐã lưu: Đổ xăng dầu, số 0001234, 1.250.000đ, ngày 30/10/2026.',
    );
  });
});
