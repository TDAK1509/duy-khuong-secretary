import { formatVietnamDateTime } from '../workspaces/format-expiry.ts';

export const UPLOAD_ONLY_TEXT =
  'Trợ lý chỉ nhận ảnh và thông tin công việc. Bạn gửi ảnh hóa đơn, phiếu giao nhận hoặc giấy tờ bảo dưỡng để lưu nhé.';

export const UNRESOLVED_TEXT =
  'Tôi đọc ảnh này chưa chắc chắn nên chưa lưu. Bạn chụp lại gần hơn, đủ sáng, hoặc nhắn rõ nội dung, ví dụ: "Thay dầu máy 850.000đ ngày 30/10".';

export const MAINTENANCE_WITHOUT_PLATE_TEXT =
  'Giấy tờ bảo dưỡng này chưa có biển số xe nên tôi chưa lưu. Bạn gửi lại ảnh kèm tin nhắn ghi biển số xe, ví dụ: 29C-123.45.';

export const DUPLICATE_TEXT =
  'Ảnh hoặc chứng từ này đã có trong nhóm. Tôi chưa lưu bản trùng. Bạn kiểm tra lại nhé.';

export const ASK_EXPLANATION_TEXT =
  'Trợ lý chưa biết ảnh này dùng để làm gì nên chưa lưu. Bạn nhắn một tin giải thích, ví dụ: "Lốp mới thay cho xe 29C-123.45, giá 3.500.000đ". Trợ lý sẽ lưu ảnh cùng lời giải thích.';

export const ASK_ADMIN_EXPLANATION_TEXT =
  'Ảnh này để lưu hay để hỏi? Nếu để lưu, bạn nhắn việc gì, cho xe nào, bao nhiêu tiền nếu có. Nếu để hỏi, bạn nhắn câu hỏi về ảnh này.';

export const ASK_LATER_TEXT =
  'Trợ lý đã nhận ảnh này nhưng chưa lưu. Trợ lý sẽ hỏi về ảnh này sau khi bạn trả lời câu hỏi về ảnh trước.';

export const ASK_AGAIN_TEXT =
  'Trợ lý vẫn chưa rõ ảnh này nên chưa lưu. Bạn nhắn rõ hơn: đây là việc gì, cho xe nào, bao nhiêu tiền nếu có.';

export const CODE_CHOICE_TEXT =
  'Trợ lý chưa đọc chắc mã trên ảnh này nên chưa lưu. Mã Trợ lý đọc được nằm ở tin nhắn bên dưới. Bạn chép và gửi lại đúng mã, hoặc chụp lại ảnh rõ hơn. Nếu mã chưa đúng, bạn nhắn mã đúng.';

export const STILL_UNCLEAR_TEXT =
  'Trợ lý vẫn chưa rõ ảnh này nên chưa lưu. Bạn gửi ảnh hóa đơn hoặc giấy tờ của việc này nhé.';

export const PHOTO_TOO_LARGE_TEXT = 'Ảnh này lớn hơn 5 MB nên Trợ lý chưa nhận. Bạn gửi lại ảnh nhỏ hơn nhé.';

export const PHOTO_NOT_JPEG_OR_PNG_TEXT = 'Trợ lý chỉ nhận ảnh dạng JPEG hoặc PNG. Bạn chụp lại rồi gửi nhé.';

export const PHOTO_NOT_DOWNLOADED_TEXT = 'Trợ lý chưa tải được ảnh này. Bạn gửi lại ảnh nhé.';

export type PhotoNotice = { senderName: string; workspaceName: string; sentAt: Date; replyText: string };

export function formatPhotoNotice({ senderName, workspaceName, sentAt, replyText }: PhotoNotice): string {
  return [
    `${senderName} gửi ảnh vào nhóm "${workspaceName}" lúc ${formatVietnamDateTime(sentAt)}.`,
    `Trợ lý đã trả lời ${senderName}:`,
    replyText,
  ].join('\n');
}

export function wrapExplanation(explanation: string): string {
  return `Lời giải thích của người gửi cho ảnh này:\n${explanation}`;
}

export function wrapRecentMessages(messages: string[]): string {
  return ['Các tin nhắn gần đây của người gửi, từ cũ đến mới:', ...messages.map((message) => `- ${message}`)].join('\n');
}

export function chooseAskText(role: 'admin' | 'member'): string {
  return role === 'admin' ? ASK_ADMIN_EXPLANATION_TEXT : ASK_EXPLANATION_TEXT;
}
