import type { NoteBlock } from '../documents/add-note-sheet.ts';
import { readTripDate, readTripPlate, type Trip } from './build-trips.ts';
import type { TripCounts } from './build-trip-report.ts';
import type { RepeatedPaper } from './drop-repeated-papers.ts';
import type { DropOffMatching } from './match-drop-off-names.ts';
import type { ModelPairing } from './pair-drop-offs-by-model.ts';
import type { TripPairing } from './pair-trips.ts';
import { readWeightKg } from './read-trip-paper.ts';
import { NO_NUMBER } from './trip-report-texts.ts';

const METHOD_NAMES = { rule: 'quy tắc', ai: 'AI' } as const;
const SIDE_NAMES = { pickup: 'lấy hàng', dropOff: 'đổ hàng' } as const;
const MAX_UNPAIRED_ROWS = 300;

export function describeTripNotes(trips: Trip[], counts: TripCounts, pairing: TripPairing, matching: DropOffMatching): NoteBlock[] {
  return [...describeCounts(counts, pairing), ...describePairings(trips), ...describeDropOffMatching(matching), ...describeUnpaired(trips)];
}

function describeCounts(counts: TripCounts, pairing: TripPairing): NoteBlock[] {
  return [
    { kind: 'blank' },
    { kind: 'label', label: 'Số chuyến', value: String(counts.trips) },
    { kind: 'label', label: 'Chuyến có cả giấy tờ lấy hàng và đổ hàng', value: String(counts.both) },
    { kind: 'label', label: 'Chuyến chỉ có giấy tờ lấy hàng', value: String(counts.pickupOnly) },
    { kind: 'label', label: 'Chuyến chỉ có giấy tờ đổ hàng', value: String(counts.dropOffOnly) },
    { kind: 'label', label: 'Bước AI', value: describeModelStep(pairing) },
  ];
}

function describePairings(trips: Trip[]): NoteBlock[] {
  const rows = trips.filter((trip) => trip.pickup !== null && trip.dropOff !== null).map(describePairing);
  return rows.length === 0 ? [] : [{ kind: 'table', header: ['Biển số', 'Ngày', 'Số phiếu lấy hàng', 'Số phiếu nhận hàng', 'Cách ghép'], rows }];
}

function describePairing(trip: Trip): string[] {
  const method = trip.method === null ? '' : METHOD_NAMES[trip.method];
  return [readTripPlate(trip) ?? '', formatDate(readTripDate(trip)), trip.pickup?.document_number ?? NO_NUMBER, trip.dropOff?.document_number ?? NO_NUMBER, method];
}

function describeDropOffMatching(matching: DropOffMatching): NoteBlock[] {
  if (matching.kind === 'skipped') return [];
  if (matching.kind === 'failed') return [{ kind: 'blank' }, { kind: 'label', label: 'Bước AI khớp nơi đổ hàng', value: `lỗi (${matching.reason}), chuyến chỉ dùng thông tin không ghi nơi đổ hàng hoặc ghi chung một nơi đổ hàng` }];
  const rows = matching.matches.map(({ name, receiverNames }) => [name, receiverNames.length === 0 ? 'không khớp' : receiverNames.join(', ')]);
  return [{ kind: 'blank' }, { kind: 'table', header: ['Nơi đổ hàng ghi trong thông tin chuyến', 'Công ty nhận hàng đã khớp'], rows }];
}

function describeUnpaired(trips: Trip[]): NoteBlock[] {
  const unpaired = trips.filter((trip) => trip.pickup === null || trip.dropOff === null);
  if (unpaired.length === 0) return [];
  const shown = unpaired.length > MAX_UNPAIRED_ROWS ? `${unpaired.length} (liệt kê ${MAX_UNPAIRED_ROWS} chuyến đầu)` : String(unpaired.length);
  return [
    { kind: 'blank' },
    { kind: 'label', label: 'Chuyến chưa ghép được hai phiếu', value: shown },
    { kind: 'table', header: ['Biển số', 'Ngày', 'Giấy tờ', 'Số phiếu'], rows: unpaired.slice(0, MAX_UNPAIRED_ROWS).map(describeUnpairedTrip) },
  ];
}

function describeUnpairedTrip(trip: Trip): string[] {
  const kind = trip.pickup === null ? 'chỉ có phiếu đổ hàng' : 'chỉ có phiếu lấy hàng';
  return [readTripPlate(trip) ?? '', formatDate(readTripDate(trip)), kind, (trip.pickup ?? trip.dropOff)?.document_number ?? NO_NUMBER];
}

function describeModelStep({ modelCalls, modelSkippedRows }: TripPairing): string {
  if (modelCalls.length === 0 && modelSkippedRows === 0) return 'không có xe cần AI ghép';
  if (modelCalls.some((call) => call.kind === 'skipped' && call.reason === 'not_configured')) return 'bỏ qua, chưa cấu hình (ghép theo quy tắc)';
  const ran = modelCalls.filter((call): call is Extract<ModelPairing, { kind: 'ran' }> => call.kind === 'ran');
  const failed = modelCalls.filter((call) => call.kind === 'failed');
  return [`${ran.length} lần chạy cho ${ran.reduce((sum, call) => sum + call.rows, 0)} phiếu lấy hàng`, `${failed.length} lần lỗi (các xe đó ghép theo quy tắc)`, `${modelSkippedRows} phiếu lấy hàng chưa gửi AI (ghép theo quy tắc)`].join(', ');
}

export function describeRepeatedPapers(repeats: RepeatedPaper[]): NoteBlock[] {
  return [
    { kind: 'blank' },
    { kind: 'label', label: 'Phiếu gửi trùng, đã bỏ khỏi bảng', value: repeats.length === 0 ? 'Không có' : String(repeats.length) },
    ...(repeats.length === 0 ? [] : [{ kind: 'table' as const, header: ['Biển số', 'Ngày', 'Loại phiếu', 'Trọng lượng hàng (kg)', 'Số phiếu bỏ', 'Số phiếu giữ'], rows: repeats.map(describeRepeat) }]),
  ];
}

function describeRepeat({ side, paper, kept }: RepeatedPaper): string[] {
  return [paper.vehicle_plate ?? '', formatDate(paper.document_date), SIDE_NAMES[side], String(readWeightKg(paper) ?? ''), paper.document_number ?? NO_NUMBER, kept.document_number ?? NO_NUMBER];
}

function formatDate(date: string | null): string {
  if (date === null) return '';
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
