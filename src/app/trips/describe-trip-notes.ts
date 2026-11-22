import type { NoteBlock } from '../documents/add-note-sheet.ts';
import { readTripDate, readTripPlate, type Trip } from './build-trips.ts';
import type { TripCounts } from './build-trip-report.ts';
import type { ModelPairing } from './pair-drop-offs-by-model.ts';
import type { TripPairing } from './pair-trips.ts';
import { NO_NUMBER } from './trip-report-texts.ts';

const METHOD_NAMES = { rule: 'quy tắc', ai: 'AI' } as const;
const MAX_UNPAIRED_ROWS = 300;

export function describeTripNotes(trips: Trip[], counts: TripCounts, pairing: TripPairing): NoteBlock[] {
  return [...describeCounts(counts, pairing), ...describePairings(trips), ...describeUnpaired(trips)];
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
  if (modelCalls.length === 0) return 'không có dòng cần AI';
  const ran = modelCalls.filter((call): call is Extract<ModelPairing, { kind: 'ran' }> => call.kind === 'ran');
  const failed = modelCalls.filter((call) => call.kind === 'failed');
  const notConfigured = modelCalls.some((call) => call.kind === 'skipped' && call.reason === 'not_configured');
  if (notConfigured) return 'bỏ qua, chưa cấu hình';
  const parts = [`${ran.length} lần chạy cho ${ran.reduce((sum, call) => sum + call.rows, 0)} dòng`, `${failed.length} lần lỗi (các dòng đó chưa ghép)`, `${modelSkippedRows} dòng bỏ qua`];
  return parts.join(', ');
}

function formatDate(date: string | null): string {
  if (date === null) return '';
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
