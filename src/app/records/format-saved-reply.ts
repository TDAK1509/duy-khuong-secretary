import { formatIsoDate } from '../time/format-iso-date.ts';
import type { NewRecord } from './new-record.ts';

export function formatSavedReply(records: NewRecord[]): string {
  const [only] = records;
  if (records.length === 1 && only) return `Đã lưu: ${only.summary}${formatTail(only, ', ', ', ngày ')}.`;
  return [`Đã lưu ${records.length} mục:`, ...records.map(formatSavedLine)].join('\n');
}

function formatSavedLine(record: Pick<NewRecord, 'summary' | 'amountVnd' | 'occurredOn'>): string {
  return `- ${record.summary}${formatTail(record, ' · ', ' · ')}`;
}

function formatTail(record: Pick<NewRecord, 'amountVnd' | 'occurredOn'>, amountSeparator: string, dateSeparator: string): string {
  const amount = record.amountVnd === null ? '' : `${amountSeparator}${formatAmount(record.amountVnd)}`;
  const date = record.occurredOn === null ? '' : `${dateSeparator}${formatIsoDate(record.occurredOn)}`;
  return amount + date;
}

export function formatAmount(amountVnd: number): string {
  return `${amountVnd.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
}
