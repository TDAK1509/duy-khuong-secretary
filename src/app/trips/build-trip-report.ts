import type { ReportCell, ReportColumn, ReportTable } from '../documents/build-report-workbook.ts';
import { buildMatchKey } from '../documents/build-match-key.ts';
import { PER_TON_UNIT } from '../facts/total-fact-values.ts';
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
};

export const GOODS_VALUE_KEY = buildMatchKey('Hàng hóa');
const NO_PLATE = '(không biển số)';
const NO_NUMBER = '(không số)';

type WinnerIndex = Map<string, WinningValue>;

export function buildTripReport(title: string, columns: TripColumn[], papers: TripPaper[], winners: WinningValue[], reviewPapers: number): TripReport {
  const index = new Map(winners.map((winner) => [`${winner.document_id}:${winner.match_key}`, winner]));
  const rows = papers.map((paper) => columns.map((column) => readCell(column, paper, index)));
  const noSourceColumns = columns.filter((column) => column.source === 'none').map((column) => column.name);
  const emptyColumns = columns.filter((column, position) => column.source !== 'none' && rows.every((cells) => cells[position] === null)).map((column) => column.name);
  const duplicates = findPossibleDuplicates(papers);
  const missingWeight = papers.filter((paper) => paper.weight_kg === null).length;
  const notes = buildNoteRows({ noSourceColumns, emptyColumns, reviewPapers, missingWeight, duplicates });
  const table = { title, columns: columns.map((column) => describeColumn(column, papers, index)), rows, extraSheets: [{ name: 'Ghi chú', rows: notes }] };
  return { table, rowsPerPlate: countRowsPerPlate(papers), reviewPapers, missingWeight, duplicates, noSourceColumns, emptyColumns };
}

function readCell(column: TripColumn, paper: TripPaper, index: WinnerIndex): ReportCell {
  if (column.source === 'none') return null;
  if (column.source === 'field') return readField(column.field, paper, index);
  const winner = index.get(`${paper.id}:${column.matchKey}`);
  if (column.source === 'fact_value') return readWinner(winner);
  return calculateAmount(winner, paper.weight_kg);
}

function readField(field: TripField, paper: TripPaper, index: WinnerIndex): ReportCell {
  switch (field) {
    case 'date': return paper.document_date;
    case 'plate': return paper.vehicle_plate;
    case 'route': return describeRoute(paper);
    case 'customer': return paper.route_customer ?? paper.customer_party;
    case 'goods': return describeWinnerText(index.get(`${paper.id}:${GOODS_VALUE_KEY}`));
    case 'weight_kg': return paper.weight_kg === null ? null : Number(paper.weight_kg);
    case 'document_number': return paper.document_number;
    case 'document_kind': return paper.kind;
    case 'sender': return paper.sender_name;
  }
}

function describeRoute(paper: TripPaper): string | null {
  if (paper.route_pickup !== null || paper.route_dropoff !== null) return `${paper.route_pickup ?? '?'} → ${paper.route_dropoff ?? '?'}`;
  return paper.issuer_name === null ? null : `${paper.issuer_name} → ?`;
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

function describeColumn(column: TripColumn, papers: TripPaper[], index: WinnerIndex): ReportColumn {
  return { name: column.name, type: chooseColumnType(column, papers, index) };
}

function chooseColumnType(column: TripColumn, papers: TripPaper[], index: WinnerIndex): ReportColumn['type'] {
  if (column.source === 'fact_amount') return 'number';
  if (column.source === 'fact_value') return papers.some((paper) => index.get(`${paper.id}:${column.matchKey}`)?.number != null) ? 'number' : 'text';
  if (column.source === 'field' && column.field === 'date') return 'date';
  if (column.source === 'field' && column.field === 'weight_kg') return 'number';
  return 'text';
}

function findPossibleDuplicates(papers: TripPaper[]): PossibleDuplicate[] {
  const groups = new Map<string, TripPaper[]>();
  for (const paper of papers) {
    const pickupKey = paper.route_pickup_key ?? paper.issuer_key;
    if (paper.vehicle_plate === null || paper.document_date === null || pickupKey === null) continue;
    const key = `${paper.vehicle_plate}|${paper.document_date}|${pickupKey}`;
    groups.set(key, [...(groups.get(key) ?? []), paper]);
  }
  return [...groups.values()].filter((group) => group.length > 1).map(describeDuplicate);
}

function describeDuplicate(group: TripPaper[]): PossibleDuplicate {
  const [first] = group as [TripPaper, ...TripPaper[]];
  return {
    plate: first.vehicle_plate ?? NO_PLATE,
    date: first.document_date ?? '',
    pickup: first.route_pickup ?? first.issuer_name ?? '',
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

function buildNoteRows({ noSourceColumns, emptyColumns, reviewPapers, missingWeight, duplicates }: NoteFacts): string[][] {
  return [
    ['Cột chưa có dữ liệu đã lưu', listNames(noSourceColumns)],
    ['Cột trống ở mọi dòng', listNames(emptyColumns)],
    ['Giấy tờ đang chờ duyệt, chưa có trong bảng', String(reviewPapers)],
    ['Giấy tờ thiếu trọng lượng hàng', String(missingWeight)],
    [],
    ['Có thể trùng chuyến (cùng xe, cùng ngày, cùng nơi lấy hàng)', duplicates.length === 0 ? 'Không có' : String(duplicates.length)],
    ...(duplicates.length === 0 ? [] : [['Biển số', 'Ngày', 'Nơi lấy hàng', 'Số chứng từ'], ...duplicates.map(describeDuplicateRow)]),
  ];
}

function listNames(names: string[]): string {
  return names.length === 0 ? 'Không có' : names.join(', ');
}

function describeDuplicateRow({ plate, date, pickup, documentNumbers }: PossibleDuplicate): string[] {
  const [year, month, day] = date.split('-');
  return [plate, `${day}/${month}/${year}`, pickup, documentNumbers.join(', ')];
}
