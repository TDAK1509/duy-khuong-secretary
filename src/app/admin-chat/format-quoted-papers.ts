import type { QuotedPaper } from './load-quoted-papers.ts';

const NO_SAVED_PAPER = 'Ảnh này chưa có giấy tờ nào đã lưu.';

export function formatQuotedPapers(papers: QuotedPaper[]): string {
  if (papers.length === 0) return NO_SAVED_PAPER;
  return papers.map(describePaper).join('\n\n');
}

function describePaper(paper: QuotedPaper, index: number): string {
  return [
    `Giấy tờ ${index + 1} (id: ${paper.id})`,
    `Loại: ${paper.kind}`,
    ...describeStatus(paper.status),
    ...describeOptional('Số giấy tờ', paper.document_number),
    `Tóm tắt: ${paper.summary}`,
  ].join('\n');
}

function describeStatus(status: QuotedPaper['status']): string[] {
  return status === 'needs_review' ? ['Trạng thái: đang chờ duyệt'] : [];
}

function describeOptional(label: string, value: string | null): string[] {
  return value === null ? [] : [`${label}: ${value}`];
}
