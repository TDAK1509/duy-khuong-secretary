import type { DocumentFactValue } from '../facts/document-fact-values.ts';
import type { QuotedPaper } from './load-quoted-papers.ts';

const NO_SAVED_PAPER = 'Ảnh này chưa có giấy tờ nào đã lưu.';

const STAGE_LABELS = { dispatch: 'lấy hàng', receipt: 'đổ hàng' };

const PARTY_ROLE_LABELS: Record<string, string> = {
  issuer: 'bên phát hành',
  supplier: 'bên bán',
  customer: 'khách hàng',
  carrier: 'bên vận chuyển',
  place: 'nơi chốn',
};

export function formatQuotedPapers(papers: QuotedPaper[]): string {
  if (papers.length === 0) return NO_SAVED_PAPER;
  return papers.map(describePaper).join('\n\n');
}

function describePaper(paper: QuotedPaper, index: number): string {
  return [
    `Giấy tờ ${index + 1} (id: ${paper.id})`,
    ...describeIdentity(paper),
    ...describePrintedFields(paper),
    ...describeSender(paper),
    `Tóm tắt: ${paper.summary}`,
    ...describeSection('Chi tiết đã lưu', paper.lines.map(describeLine)),
    ...describeSection('Công ty và nơi chốn', paper.parties.map(describeParty)),
    ...describeSection('Giá trị từ thông tin cố định', paper.fact_values.map(describeFactValue)),
  ].join('\n');
}

function describeIdentity(paper: QuotedPaper): string[] {
  return [
    `Loại: ${paper.kind}`,
    ...describeOptional('Tiêu đề', paper.title),
    ...(paper.status === 'needs_review' ? ['Trạng thái: đang chờ duyệt'] : []),
    ...describeOptional('Giai đoạn', paper.stage === null ? null : STAGE_LABELS[paper.stage]),
  ];
}

function describePrintedFields(paper: QuotedPaper): string[] {
  return [
    ...describeOptional('Số giấy tờ', paper.document_number),
    ...describeOptional('Ngày trên giấy tờ', paper.document_date),
    ...describeOptional('Biển số', paper.plate),
  ];
}

function describeSender({ sender, sent_at: sentAt }: QuotedPaper): string[] {
  return sender === null ? [] : [`Người gửi: ${sender}, lúc ${sentAt}`];
}

function describeOptional(label: string, value: string | null): string[] {
  return value === null ? [] : [`${label}: ${value}`];
}

function describeSection(heading: string, items: string[]): string[] {
  return items.length === 0 ? [] : [`${heading}:`, ...items];
}

function describeLine({ item, label, value }: QuotedPaper['lines'][number]): string {
  return item === null ? `- ${label}: ${value}` : `- ${item} - ${label}: ${value}`;
}

function describeParty({ role, name }: QuotedPaper['parties'][number]): string {
  return `- ${PARTY_ROLE_LABELS[role] ?? role}: ${name}`;
}

function describeFactValue({ name, text, number, unit }: DocumentFactValue): string {
  return `- ${name}: ${text ?? `${number} ${unit}`}`;
}
