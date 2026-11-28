import { findKeptPaper, type KeptPaper } from '../documents/kept-paper.ts';
import { describeSavedPaper } from '../documents/saved-papers.ts';
import { formatIsoDate } from '../time/format-iso-date.ts';
import type { NewRecord } from './new-record.ts';

type Separators = { amount: string; date: string };

export function formatSavedReply(records: NewRecord[], driverName: string | null = null, keptPapers: KeptPaper[] = []): string {
  const [only] = records;
  const forDriver = driverName === null ? '' : ` cho tài xế ${driverName}`;
  if (records.length === 1 && only) return `Đã lưu${forDriver}: ${formatSummary(only, keptPapers, { amount: ', ', date: ', ngày ' })}.`;
  const lines = records.map((record) => `- ${formatSummary(record, keptPapers, { amount: ' · ', date: ' · ' })}`);
  return [`Đã lưu${forDriver} ${records.length} mục:`, ...lines].join('\n');
}

function formatSummary(record: NewRecord, keptPapers: KeptPaper[], separators: Separators): string {
  const paper = findKeptPaper(keptPapers, record);
  if (paper !== null) return `${describeSavedPaper(paper)} (giấy tờ đã lưu từ trước, Trợ lý thêm ảnh này vào)`;
  return record.summary + formatTail(record, separators);
}

function formatTail(record: Pick<NewRecord, 'amountVnd' | 'occurredOn'>, separators: Separators): string {
  const amount = record.amountVnd === null ? '' : `${separators.amount}${formatAmount(record.amountVnd)}`;
  const date = record.occurredOn === null ? '' : `${separators.date}${formatIsoDate(record.occurredOn)}`;
  return amount + date;
}

export function formatAmount(amountVnd: number): string {
  return `${amountVnd.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
}
