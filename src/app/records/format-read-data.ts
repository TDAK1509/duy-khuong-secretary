import { findKeptPaper, type KeptPaper } from '../documents/kept-paper.ts';
import type { SavedPaper } from '../documents/saved-papers.ts';
import { formatIsoDate } from '../time/format-iso-date.ts';
import { formatAmount } from './format-saved-reply.ts';
import type { NewRecord } from './new-record.ts';

const KEPT_PAPER_LINE = '- Trợ lý giữ nguyên thông tin đã lưu và chỉ thêm ảnh này.';

export function formatReadData(records: NewRecord[], keptPapers: KeptPaper[] = []): string {
  const blocks = records.flatMap((record, position) => formatReadRecord(record, position, findKeptPaper(keptPapers, record)));
  return ['Dữ liệu đã đọc:', ...blocks].join('\n');
}

function formatReadRecord(record: NewRecord, position: number, keptPaper: SavedPaper | null): string[] {
  const heading = `Mục ${position + 1}: `;
  if (keptPaper !== null) return [`${heading}giấy tờ đã lưu từ trước`, KEPT_PAPER_LINE, ...describeDifferences(record, keptPaper)];
  return [heading + record.category, ...formatReadFields(record), ...record.details.map(formatReadDetail)];
}

function describeDifferences(record: NewRecord, paper: SavedPaper): string[] {
  const fields: [string, string | null, string | null][] = [
    ['biển số', record.vehiclePlate, paper.plate],
    ['số phiếu', record.documentNumber, paper.documentNumber],
    ['ngày trên giấy tờ', record.occurredOn === null ? null : formatIsoDate(record.occurredOn), paper.documentDate],
  ];
  return fields.flatMap(([label, read, saved]) =>
    read === null || read === saved ? [] : [`- Ảnh này đọc ra ${label} ${read}, giấy tờ đã lưu ghi ${saved ?? 'trống'}.`],
  );
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
