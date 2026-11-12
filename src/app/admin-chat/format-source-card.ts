import { formatVietnamDate } from '../time/format-vietnam-date.ts';
import { formatVietnamTime } from '../time/format-vietnam-time.ts';
import type { RecordSource } from '../records/record-source.ts';

export function formatSourceCard(cardNumber: number, source: RecordSource): string {
  const kind = source.kind === 'photo' ? 'ảnh' : 'tin nhắn';
  const sender = source.isOwn ? 'Bạn' : source.sender;
  const header = `Nguồn ${cardNumber}: ${sender} gửi ${kind} lúc ${formatVietnamTime(source.sentAt)} ngày ${formatVietnamDate(source.sentAt)}.`;
  const paperDates = source.paperDates.length === 0 ? [] : [`Ngày trên giấy tờ: ${source.paperDates.join(', ')}.`];
  const original = source.text === null ? [] : [`Nguyên văn: "${source.text}"`];
  return [header, ...paperDates, ...original].join('\n');
}
