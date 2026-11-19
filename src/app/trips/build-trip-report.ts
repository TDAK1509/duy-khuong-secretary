import type { ReportCell, ReportColumn, ReportTable } from '../documents/build-report-workbook.ts';
import { GOODS_VALUE_KEY } from '../facts/fact.ts';
import { PER_TON_UNIT } from '../facts/total-fact-values.ts';
import type { NoteBlock } from '../documents/add-note-sheet.ts';
import { chooseValueUnit } from '../documents/choose-value-unit.ts';
import { INFERRED_MARK, type ColumnUnit } from '../documents/format-workbook-sheet.ts';
import { describeDropOffNotes } from './describe-drop-off-notes.ts';
import { NO_NUMBER } from './trip-report-texts.ts';
import type { DropOffInference, InferredDropOff } from './infer-drop-offs.ts';
import type { TripPaper, WinningValue } from './list-trip-papers.ts';

export const TRIP_FIELDS = ['date', 'plate', 'route', 'customer', 'goods', 'weight_kg', 'document_number', 'document_kind', 'sender'] as const;

export type TripField = (typeof TRIP_FIELDS)[number];

export type TripColumn = { name: string } & (
  | { source: 'field'; field: TripField }
  | { source: 'fact_value'; matchKey: string }
  | { source: 'fact_amount'; matchKey: string }
  | { source: 'none' }
);

export type PossibleDuplicate = { plate: string; date: string; pickup: string; documentNumbers: string[] };

export type TripReport = {
  table: ReportTable;
  rowsPerPlate: Record<string, number>;
  reviewPapers: number;
  missingWeight: number;
  duplicates: PossibleDuplicate[];
  noSourceColumns: string[];
  emptyColumns: string[];
  dropOffs: DropOffInference | null;
};

const NO_PLATE = '(không biển số)';

type CellSources = { index: Map<string, WinningValue>; inferred: Map<string, InferredDropOff> };

export type TripReportInput = { title: string; createdAt: Date; columns: TripColumn[]; papers: TripPaper[]; winners: WinningValue[]; reviewPapers: number; dropOffs: DropOffInference | null };

export function buildTripReport({ title, createdAt, columns, papers, winners, reviewPapers, dropOffs }: TripReportInput): TripReport {
  const index = new Map(winners.map((winner) => [`${winner.document_id}:${winner.match_key}`, winner]));
  const rows = papers.map((paper) => columns.map((column) => readCell(column, paper, { index, inferred: dropOffs?.inferred ?? new Map() })));
  const noSourceColumns = columns.filter((column) => column.source === 'none').map((column) => column.name);
  const emptyColumns = columns.filter((column, position) => column.source !== 'none' && rows.every((cells) => cells[position] === null)).map((column) => column.name);
  const duplicates = findPossibleDuplicates(papers);
  const missingWeight = papers.filter((paper) => paper.weight_kg === null).length;
  const notes = [...buildNoteRows({ noSourceColumns, emptyColumns, reviewPapers, missingWeight, duplicates }), ...(dropOffs === null ? [] : describeDropOffNotes(dropOffs, papers))];
  const table = { title, createdAt, columns: columns.map((column) => describeColumn(column, papers, index)), rows, extraSheets: [{ name: 'Ghi chú', blocks: notes }] };
  return { table, rowsPerPlate: countRowsPerPlate(papers), reviewPapers, missingWeight, duplicates, noSourceColumns, emptyColumns, dropOffs };
}

function readCell(column: TripColumn, paper: TripPaper, sources: CellSources): ReportCell {
  if (column.source === 'none') return null;
  if (column.source === 'field') return readField(column.field, paper, sources);
  const winner = sources.index.get(`${paper.id}:${column.matchKey}`);
  if (column.source === 'fact_value') return readWinner(winner);
  return calculateAmount(winner, paper.weight_kg);
}

function readField(field: TripField, paper: TripPaper, { index, inferred }: CellSources): ReportCell {
  switch (field) {
    case 'date': return paper.document_date;
    case 'plate': return paper.vehicle_plate;
    case 'route': return describeRoute(paper, inferred.get(paper.id));
    case 'customer': return paper.route_customer ?? paper.customer_party;
    case 'goods': return describeWinnerText(index.get(`${paper.id}:${GOODS_VALUE_KEY}`));
    case 'weight_kg': return paper.weight_kg === null ? null : Number(paper.weight_kg);
    case 'document_number': return paper.document_number;
    case 'document_kind': return paper.kind;
    case 'sender': return paper.sender_name;
  }
}

function describeRoute(paper: TripPaper, inferred: InferredDropOff | undefined): string | null {
  const pickup = paper.route_pickup ?? (paper.route_dropoff === null ? readDispatchIssuer(paper) : null);
  if (pickup === null && paper.route_dropoff === null) return null;
  if (inferred !== undefined) return `${pickup ?? '?'} → ${inferred.dropOff} ${INFERRED_MARK}`;
  return `${pickup ?? '?'} → ${paper.route_dropoff ?? '?'}`;
}

export function readDispatchIssuer(paper: TripPaper): string | null {
  return paper.stage === 'dispatch' ? paper.issuer_name : null;
}

function readWinner(winner: WinningValue | undefined): ReportCell {
  if (winner === undefined) return null;
  return winner.number === null ? winner.text : Number(winner.number);
}

function describeWinnerText(winner: WinningValue | undefined): string | null {
  if (winner === undefined) return null;
  return winner.text ?? `${winner.number}${winner.unit ?? ''}`;
}

function calculateAmount(winner: WinningValue | undefined, weightKg: string | null): number | null {
  if (winner?.number == null || winner.unit !== PER_TON_UNIT || weightKg === null) return null;
  return Math.round((Number(winner.number) * Number(weightKg)) / 1000);
}

function describeColumn(column: TripColumn, papers: TripPaper[], index: CellSources["index"]): ReportColumn {
  const type = chooseColumnType(column, papers, index);
  return { name: column.name, type, unit: type === 'number' ? chooseColumnUnit(column, papers, index) : null };
}

function chooseColumnUnit(column: TripColumn, papers: TripPaper[], index: CellSources["index"]): ColumnUnit | null {
  if (column.source === 'fact_amount') return 'vnd';
  if (column.source === 'field' && column.field === 'weight_kg') return 'kg';
  if (column.source !== 'fact_value') return null;
  return chooseValueUnit(papers.flatMap((paper) => index.get(`${paper.id}:${column.matchKey}`) ?? []));
}

function chooseColumnType(column: TripColumn, papers: TripPaper[], index: CellSources["index"]): ReportColumn['type'] {
  if (column.source === 'fact_amount') return 'number';
  if (column.source === 'fact_value') return papers.some((paper) => index.get(`${paper.id}:${column.matchKey}`)?.number != null) ? 'number' : 'text';
  if (column.source === 'field' && column.field === 'date') return 'date';
  if (column.source === 'field' && column.field === 'weight_kg') return 'number';
  return 'text';
}

function findPossibleDuplicates(papers: TripPaper[]): PossibleDuplicate[] {
  return groupPossibleDuplicates(papers).map(describeDuplicate);
}

export function groupPossibleDuplicates(papers: TripPaper[]): TripPaper[][] {
  const groups = new Map<string, TripPaper[]>();
  for (const paper of papers) {
    const pickupKey = readPickupKey(paper);
    if (paper.vehicle_plate === null || paper.document_date === null || pickupKey === null) continue;
    const key = `${paper.vehicle_plate}|${paper.document_date}|${pickupKey}`;
    groups.set(key, [...(groups.get(key) ?? []), paper]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

function readPickupKey(paper: TripPaper): string | null {
  if (paper.route_pickup_key !== null) return `name:${paper.route_pickup_key}`;
  if (paper.route_dropoff !== null || paper.stage !== 'dispatch') return null;
  return paper.issuer_company_id === null ? null : `company:${paper.issuer_company_id}`;
}

function describeDuplicate(group: TripPaper[]): PossibleDuplicate {
  const [first] = group as [TripPaper, ...TripPaper[]];
  return {
    plate: first.vehicle_plate ?? NO_PLATE,
    date: first.document_date ?? '',
    pickup: first.route_pickup ?? readDispatchIssuer(first) ?? '',
    documentNumbers: group.map((paper) => paper.document_number ?? NO_NUMBER),
  };
}

function countRowsPerPlate(papers: TripPaper[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const paper of papers) {
    const plate = paper.vehicle_plate ?? NO_PLATE;
    counts[plate] = (counts[plate] ?? 0) + 1;
  }
  return counts;
}

type NoteFacts = { noSourceColumns: string[]; emptyColumns: string[]; reviewPapers: number; missingWeight: number; duplicates: PossibleDuplicate[] };

function buildNoteRows({ noSourceColumns, emptyColumns, reviewPapers, missingWeight, duplicates }: NoteFacts): NoteBlock[] {
  return [
    { kind: 'label', label: 'Cột chưa có dữ liệu đã lưu', value: listNames(noSourceColumns) },
    { kind: 'label', label: 'Cột trống ở mọi dòng', value: listNames(emptyColumns) },
    { kind: 'label', label: 'Giấy tờ đang chờ duyệt, chưa có trong bảng', value: String(reviewPapers) },
    { kind: 'label', label: 'Giấy tờ thiếu trọng lượng hàng', value: String(missingWeight) },
    { kind: 'blank' },
    { kind: 'label', label: 'Có thể trùng chuyến (cùng xe, cùng ngày, cùng nơi lấy hàng)', value: duplicates.length === 0 ? 'Không có' : String(duplicates.length) },
    ...(duplicates.length === 0 ? [] : [{ kind: 'table' as const, header: ['Biển số', 'Ngày', 'Nơi lấy hàng', 'Số chứng từ'], rows: duplicates.map(describeDuplicateRow) }]),
  ];
}

function listNames(names: string[]): string {
  return names.length === 0 ? 'Không có' : names.join(', ');
}

function describeDuplicateRow({ plate, date, pickup, documentNumbers }: PossibleDuplicate): string[] {
  const [year, month, day] = date.split('-');
  return [plate, `${day}/${month}/${year}`, pickup, documentNumbers.join(', ')];
}
