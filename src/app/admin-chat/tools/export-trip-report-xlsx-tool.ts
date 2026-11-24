import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { buildReportWorkbook } from '../../documents/build-report-workbook.ts';
import { describeEffectiveLayout, layoutArgumentSchema, readReportLayout, type LayoutChoice } from '../../documents/report-layout.ts';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import { isRealIsoDate } from '../../time/is-real-iso-date.ts';
import { GOODS_VALUE_KEY } from '../../facts/fact.ts';
import { buildTripReport, TRIP_FIELDS, type TripColumn, type TripReport } from '../../trips/build-trip-report.ts';
import { buildTrips, keepReportReceipts } from '../../trips/build-trips.ts';
import { pairTrips, type TripPairing } from '../../trips/pair-trips.ts';
import { countReviewTripPapers, listKnownValues, listReceiptPapers, listTripPapers, listWinningValues, type KnownValue, type TripPaperQuery } from '../../trips/list-trip-papers.ts';
import type { ReaderService } from '../../../services/reading/reader-service.ts';
import type { FileStorage } from '../../../services/storage/file-storage.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';
import { EXPORT_EXPIRES_HOURS, EXPORT_NOT_CONFIGURED_ERROR, storeExcelExport } from './store-excel-export.ts';
import { failTool, INVALID_DATE_ERROR, REFUSAL_ERROR } from './tool-result.ts';

const MAX_DAYS = 92;
const MAX_COLUMNS = 40;
const MAX_ROWS = 5000;
const MAX_TITLE_LENGTH = 120;
const MAX_COLUMN_NAME_LENGTH = 80;
const DAY_MS = 86_400_000;

const columnSchema = z.strictObject({
  name: z.string(),
  source: z.enum(['field', 'fact_value', 'fact_amount', 'none']),
  field: z.enum(TRIP_FIELDS).nullable(),
  value_name: z.string().nullable(),
});

const argumentsSchema = z.strictObject({
  title: z.string(),
  date_from: z.string(),
  date_to: z.string(),
  plate: z.string().nullable(),
  columns: z.array(columnSchema),
  layout: layoutArgumentSchema,
});

type TripReportRequest = z.infer<typeof argumentsSchema>;
type ColumnArgument = z.infer<typeof columnSchema>;
type ResolvedColumns = { ok: true; columns: TripColumn[] } | { ok: false; error: string };

export async function runExportTripReportXlsx(dependencies: AdminToolDependencies, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  if (scope.role !== 'admin') return failTool(REFUSAL_ERROR);
  const storage = dependencies.fileStorage ?? null;
  if (storage === null) return failTool(EXPORT_NOT_CONFIGURED_ERROR);
  const request = argumentsSchema.parse(parsedArguments);
  const problem = findRequestProblem(request);
  if (problem !== null) return failTool(problem);
  const resolved = readColumns(request.columns, await listKnownValues(dependencies.database, scope.workspaceId));
  if (!resolved.ok) return failTool(resolved.error);
  return exportTripReport(storage, dependencies.database, scope, { request, columns: resolved.columns, dropOffReader: dependencies.dropOffReader ?? null, createdAt: dependencies.clock.now() });
}

function findRequestProblem({ title, date_from: dateFrom, date_to: dateTo, columns }: TripReportRequest): string | null {
  if (title.trim() === '' || title.length > MAX_TITLE_LENGTH) return `Tiêu đề cần có từ 1 đến ${MAX_TITLE_LENGTH} ký tự.`;
  if (!isRealIsoDate(dateFrom) || !isRealIsoDate(dateTo)) return INVALID_DATE_ERROR;
  if (dateFrom > dateTo) return 'Ngày bắt đầu phải trước ngày kết thúc.';
  if ((Date.parse(dateTo) - Date.parse(dateFrom)) / DAY_MS > MAX_DAYS) return `Báo cáo chuyến chỉ lấy tối đa ${MAX_DAYS} ngày. Hãy chia thành nhiều báo cáo.`;
  if (columns.length === 0 || columns.length > MAX_COLUMNS) return `Báo cáo cần có từ 1 đến ${MAX_COLUMNS} cột.`;
  return null;
}

function readColumns(columns: ColumnArgument[], known: KnownValue[]): ResolvedColumns {
  const resolved: TripColumn[] = [];
  for (const column of columns) {
    const result = readColumn(column, known);
    if (typeof result === 'string') return { ok: false, error: result };
    resolved.push(result);
  }
  return { ok: true, columns: resolved };
}

function readColumn({ name, source, field, value_name: valueName }: ColumnArgument, known: KnownValue[]): TripColumn | string {
  if (name.trim() === '' || name.length > MAX_COLUMN_NAME_LENGTH) return `Tên cột cần có từ 1 đến ${MAX_COLUMN_NAME_LENGTH} ký tự.`;
  if (source === 'none') return { name, source };
  if (source === 'field') return field === null ? `Cột "${name}" cần field.` : { name, source, field };
  if (valueName === null || buildMatchKey(valueName) === '') return `Cột "${name}" cần value_name.`;
  return readValueColumn(name, source, valueName, known);
}

function readValueColumn(name: string, source: 'fact_value' | 'fact_amount', valueName: string, known: KnownValue[]): TripColumn | string {
  const value = known.find((candidate) => candidate.match_key === buildMatchKey(valueName));
  if (value === undefined) return `Không có giá trị "${valueName}" trong thông tin chuyến đã lưu. Các giá trị đã lưu: ${listNames(known)}.`;
  if (source === 'fact_amount' && !value.per_ton) return `Giá trị "${valueName}" không tính theo đ/tấn. Các giá trị theo đ/tấn: ${listNames(known.filter((candidate) => candidate.per_ton))}.`;
  return { name, source, matchKey: value.match_key };
}

function listNames(values: KnownValue[]): string {
  return values.length === 0 ? 'không có' : values.map((value) => value.name).join(', ');
}

type PlannedReport = { request: TripReportRequest; columns: TripColumn[]; dropOffReader: ReaderService | null; createdAt: Date };

async function exportTripReport(storage: FileStorage, database: Database, scope: AccessScope, { request, columns, dropOffReader, createdAt }: PlannedReport): Promise<string> {
  const query: TripPaperQuery = { workspaceId: scope.workspaceId, dateFrom: request.date_from, dateTo: request.date_to, plate: request.plate, limit: MAX_ROWS + 1 };
  const pickups = await listTripPapers(database, { ...query, dateFrom: addDays(request.date_from, -1) });
  const allReceipts = await listReceiptPapers(database, { ...query, dateFrom: addDays(request.date_from, -1), dateTo: addDays(request.date_to, 1) });
  if (pickups.length > MAX_ROWS || allReceipts.length > MAX_ROWS) return failTool(`Có hơn ${MAX_ROWS} giấy tờ chuyến trong khoảng này. Hãy chọn khoảng ngắn hơn hoặc một xe.`);
  const receipts = keepReportReceipts(pickups, allReceipts, request.date_from, request.date_to);
  const pairing = await pairTrips(dropOffReader, { pickups, receipts });
  const trips = buildTrips({ pickups, receipts, dateFrom: request.date_from, dateTo: request.date_to }, pairing);
  if (trips.length === 0) return JSON.stringify({ ok: false, reason: 'no_matches' });
  const documentIds = trips.flatMap((trip) => [trip.pickup?.id ?? [], trip.dropOff?.id ?? []].flat());
  const winners = await listWinningValues(database, scope.workspaceId, documentIds, listValueKeys(columns));
  const report = buildTripReport({ title: request.title, createdAt, columns, trips, pickups, winners, reviewPapers: await countReviewTripPapers(database, query), pairing, dateFrom: request.date_from, dateTo: request.date_to });
  const choice = keepTripOrderUnlessChosen(readReportLayout(request.layout, report.table.columns));
  const table = { ...report.table, layout: choice.layout };
  const { url, filename } = await storeExcelExport(storage, scope, createdAt, await buildReportWorkbook(table), 'bao-cao-chuyen');
  return JSON.stringify({ ok: true, url, filename, ...summarizeReport(report, pairing), layout: describeEffectiveLayout(choice, table.columns), expires_hours: EXPORT_EXPIRES_HOURS });
}

function keepTripOrderUnlessChosen(choice: LayoutChoice): LayoutChoice {
  return choice.kind === 'chosen' ? choice : { ...choice, layout: { sort: [] } };
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function listValueKeys(columns: TripColumn[]): string[] {
  const keys = columns.flatMap((column) => (column.source === 'fact_value' || column.source === 'fact_amount' ? [column.matchKey] : []));
  return [...new Set([...keys, GOODS_VALUE_KEY])];
}

function summarizeReport(report: TripReport, pairing: TripPairing) {
  return {
    rows: report.counts.trips,
    ...summarizeTrips(report.counts),
    ...summarizeModelStep(pairing),
    rows_per_plate: report.rowsPerPlate,
    needs_review: report.reviewPapers,
    missing_weight: report.missingWeight,
    possible_duplicates: report.duplicates.length,
    empty_columns: [...report.noSourceColumns, ...report.emptyColumns],
  };
}

function summarizeTrips({ both, pickupOnly, dropOffOnly, byRule, byAi }: TripReport['counts']) {
  return { trips_with_both_papers: both, trips_pickup_only: pickupOnly, trips_drop_off_only: dropOffOnly, paired_by_rule: byRule, paired_by_ai: byAi };
}

function summarizeModelStep({ modelCalls, modelSkippedRows }: TripPairing) {
  return {
    ai_calls_ran: modelCalls.filter((call) => call.kind === 'ran').length,
    ai_calls_failed: modelCalls.filter((call) => call.kind === 'failed').length,
    ai_rows_skipped: modelSkippedRows,
  };
}
