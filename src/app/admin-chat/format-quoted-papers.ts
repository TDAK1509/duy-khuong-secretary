import type { QuotedPaper } from './load-quoted-papers.ts';

export function formatQuotedPapers(papers: QuotedPaper[]): string {
  return papers.map(describePaper).join('\n\n');
}

function describePaper(paper: QuotedPaper, index: number): string {
  return [
    `Giấy tờ ${index + 1} (id: ${paper.id})`,
    `Loại: ${paper.kind}`,
    ...describeStatus(paper.status),
    ...describeOptional('Số giấy tờ', paper.document_number),
  ].join('\n');
}

function describeStatus(status: QuotedPaper['status']): string[] {
  return status === 'needs_review' ? ['Trạng thái: đang chờ duyệt'] : [];
}

function describeOptional(label: string, value: string | null): string[] {
  return value === null ? [] : [`${label}: ${value}`];
}
