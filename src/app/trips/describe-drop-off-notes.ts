import type { NoteBlock } from '../documents/add-note-sheet.ts';
import type { DropOffInference } from './infer-drop-offs.ts';
import type { TripPaper } from './list-trip-papers.ts';
import { NO_NUMBER } from './trip-report-texts.ts';

const METHOD_NAMES = { rule: 'quy tắc', ai: 'AI' } as const;

export function describeDropOffNotes(inference: DropOffInference, papers: TripPaper[]): NoteBlock[] {
  const byId = new Map(papers.map((paper) => [paper.id, paper]));
  const pairings = [...inference.inferred].flatMap(([paperId, pair]) => {
    const paper = byId.get(paperId);
    if (paper === undefined) return [];
    return [[paper.vehicle_plate ?? '', formatDate(paper.document_date), paper.document_number ?? NO_NUMBER, pair.receiptNumber ?? NO_NUMBER, METHOD_NAMES[pair.method]]];
  });
  return [
    { kind: 'blank' },
    { kind: 'label', label: 'Nơi đổ hàng do AI suy luận ra', value: String(pairings.length) },
    { kind: 'label', label: 'Bước AI', value: describeModelStep(inference.model) },
    { kind: 'label', label: 'Dòng vẫn chưa rõ nơi đổ hàng', value: String(inference.stillUnknown) },
    ...(pairings.length === 0 ? [] : [{ kind: 'table' as const, header: ['Biển số', 'Ngày', 'Số phiếu lấy hàng', 'Số phiếu nhận hàng', 'Cách ghép'], rows: pairings }]),
  ];
}

function describeModelStep(model: DropOffInference['model']): string {
  if (model.kind === 'ran') return `đã chạy cho ${model.rows} dòng`;
  if (model.kind === 'failed') return `lỗi (${model.reason}), các dòng đó giữ "?"`;
  return model.reason === 'not_configured' ? 'bỏ qua, chưa cấu hình' : 'bỏ qua, không có dòng cần AI';
}

function formatDate(date: string | null): string {
  if (date === null) return '';
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
