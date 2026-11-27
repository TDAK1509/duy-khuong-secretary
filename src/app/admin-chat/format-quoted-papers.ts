import type { QuotedPaper } from './load-quoted-papers.ts';

export function formatQuotedPapers(papers: QuotedPaper[]): string {
  return papers.map(describePaper).join('\n\n');
}

function describePaper(paper: QuotedPaper, index: number): string {
  return [
    `Giấy tờ ${index + 1} (id: ${paper.id})`,
    `Loại: ${paper.kind}`,
    ...describeOptional('Số giấy tờ', paper.document_number),
  ].join('\n');
}

function describeOptional(label: string, value: string | null): string[] {
  return value === null ? [] : [`${label}: ${value}`];
}
