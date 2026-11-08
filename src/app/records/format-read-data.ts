import { formatIsoDate } from '../time/format-iso-date.ts';
import { formatAmount } from './format-saved-reply.ts';
import type { NewRecord } from './new-record.ts';

export function formatReadData(records: NewRecord[]): string {
  return ['Dữ liệu đã đọc:', ...records.flatMap(formatReadRecord)].join('\n');
}

function formatReadRecord(record: NewRecord, position: number): string[] {
  return [`Mục ${position + 1}: ${record.category}`, ...formatReadFields(record), ...record.details.map(formatReadDetail)];
}

function formatReadFields(record: NewRecord): string[] {
  const fields: [string, string | null][] = [
    ['Tiêu đề', record.documentTitle],
    ['Biển số', record.vehiclePlate],
    ['Số phiếu', record.documentNumber],
    ['Ngày trên giấy tờ', record.occurredOn === null ? null : formatIsoDate(record.occurredOn)],
    ['Số tiền', record.amountVnd === null ? null : formatAmount(record.amountVnd)],
    ['Bảo dưỡng', record.maintenanceItem],
    ['Mã', record.identifiers.length === 0 ? null : record.identifiers.join(', ')],
  ];
  return fields.flatMap(([label, value]) => (value === null ? [] : [`- ${label}: ${value}`]));
}

function formatReadDetail({ label, value }: NewRecord['details'][number]): string {
  return `- ${label}: ${value}`;
}
