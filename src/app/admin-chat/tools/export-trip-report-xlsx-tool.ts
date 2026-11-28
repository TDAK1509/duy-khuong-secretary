import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { buildReportWorkbook } from '../../documents/build-report-workbook.ts';
import { describeEffectiveLayout, layoutArgumentSchema, readReportLayout, type LayoutChoice } from '../../documents/report-layout.ts';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import { isRealIsoDate } from '../../time/is-real-iso-date.ts';
import { OUTCOME_DEFINITIONS, PER_TON_UNIT, SHOWN_GOODS_MATCH_KEY } from '../../facts/knowledge-outcomes.ts';
import { buildTripReport, TRIP_FIELDS, type TripColumn, type TripReport } from '../../trips/build-trip-report.ts';
import { buildTrips, type Trip } from '../../trips/build-trips.ts';
import type { RepeatedPaper } from '../../trips/drop-repeated-papers.ts';
import { DAY_MS, loadTripPapers, MAX_TRIP_PAPERS, TOO_MANY_PAPERS_ERROR } from '../../trips/load-trip-papers.ts';
import { pairTrips, type TripPairing } from '../../trips/pair-trips.ts';
import { countReviewTripPapers, listWinningValues, type TripPaper, type TripPaperQuery } from '../../trips/list-trip-papers.ts';
import { matchTripEntries } from '../../trips/match-trip-entries.ts';
import { listWorkspaceRules } from '../../workspace-rules/list-workspace-rules.ts';
import type { ReaderService } from '../../../services/reading/reader-service.ts';
import type { FileStorage } from '../../../services/storage/file-storage.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';
import { EXPORT_EXPIRES_HOURS, EXPORT_NOT_CONFIGURED_ERROR, storeExcelExport } from './store-excel-export.ts';
import { failTool, INVALID_DATE_ERROR, REFUSAL_ERROR } from './tool-result.ts';

const MAX_DAYS = 92;
const MAX_COLUMNS = 40;
const MAX_TITLE_LENGTH = 120;
const MAX_COLUMN_NAME_LENGTH = 80;

const columnSchema = z.strictObject({
  name: z.string(),
  source: z.enum(['field', 'knowledge_value', 'knowledge_amount', 'none']),
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
  const resolved = readColumns(request.columns);
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

function readColumns(columns: ColumnArgument[]): ResolvedColumns {
  const resolved: TripColumn[] = [];
  for (const column of columns) {
    const result = readColumn(column);
    if (typeof result === 'string') return { ok: false, error: result };
    resolved.push(result);
  }
  return { ok: true, columns: resolved };
}

function readColumn({ name, source, field, value_name: valueName }: ColumnArgument): TripColumn | string {
  if (name.trim() === '' || name.length > MAX_COLUMN_NAME_LENGTH) return `Tên cột cần có từ 1 đến ${MAX_COLUMN_NAME_LENGTH} ký tự.`;
  if (source === 'none') return { name, source };
  if (source === 'field') return field === null ? `Cột "${name}" cần field.` : { name, source, field };
  if (valueName === null || buildMatchKey(valueName) === '') return `Cột "${name}" cần value_name.`;
  return readValueColumn(name, source, valueName);
}

function readValueColumn(name: string, source: 'knowledge_value' | 'knowledge_amount', valueName: string): TripColumn | string {
  const value = OUTCOME_DEFINITIONS.find((candidate) => candidate.matchKey === buildMatchKey(valueName));
  if (value === undefined) return `Không có kết quả "${valueName}" trong kiến thức công ty. Các kết quả: ${listNames(OUTCOME_DEFINITIONS)}.`;
  if (source === 'knowledge_amount' && value.unit !== PER_TON_UNIT) return `Kết quả "${valueName}" không tính theo đ/tấn. Các kết quả theo đ/tấn: ${listNames(OUTCOME_DEFINITIONS.filter((candidate) => candidate.unit === PER_TON_UNIT))}.`;
  return { name, source, matchKey: value.matchKey };
}

function listNames(values: readonly { name: string }[]): string {
  return values.map((value) => value.name).join(', ');
}

type PlannedReport = { request: TripReportRequest; columns: TripColumn[]; dropOffReader: ReaderService | null; createdAt: Date };

async function exportTripReport(storage: FileStorage, database: Database, scope: AccessScope, planned: PlannedReport): Promise<string> {
  const { request, dropOffReader } = planned;
  const query: TripPaperQuery = { workspaceId: scope.workspaceId, dateFrom: request.date_from, dateTo: request.date_to, plate: request.plate, limit: MAX_TRIP_PAPERS + 1 };
  const papers = await loadTripPapers(database, query);
  if (papers === null) return failTool(TOO_MANY_PAPERS_ERROR);
  const rules = await listWorkspaceRules(database, scope.workspaceId);
  const pairing = await pairTrips(dropOffReader, papers, rules.map(({ rule }) => rule));
  const trips = buildTrips({ ...papers, dateFrom: request.date_from, dateTo: request.date_to }, pairing);
  if (trips.length === 0) return JSON.stringify({ ok: false, reason: 'no_matches' });
  const report = await buildReport(database, scope, planned, { query, pickups: papers.pickups, repeats: papers.repeats, trips, pairing });
  return storeReport(storage, scope, planned, report, pairing);
}

type PairedTrips = { query: TripPaperQuery; pickups: TripPaper[]; repeats: RepeatedPaper[]; trips: Trip[]; pairing: TripPairing };

async function buildReport(database: Database, scope: AccessScope, { request, columns, dropOffReader, createdAt }: PlannedReport, { query, pickups, repeats, trips, pairing }: PairedTrips): Promise<TripReport> {
  const entries = await matchTripEntries(database, dropOffReader, scope.workspaceId, trips);
  const documentIds = entries.trips.flatMap((trip) => [trip.pickup?.id ?? [], trip.dropOff?.id ?? []].flat());
  const winners = await listWinningValues(database, scope.workspaceId, documentIds, listValueKeys(columns), entries.excludedLinks);
  const reviewPapers = await countReviewTripPapers(database, query);
  return buildTripReport({ title: request.title, createdAt, columns, trips: entries.trips, pickups, repeats, winners, reviewPapers, pairing, matching: entries.matching, dateFrom: request.date_from, dateTo: request.date_to });
}

async function storeReport(storage: FileStorage, scope: AccessScope, { request, createdAt }: PlannedReport, report: TripReport, pairing: TripPairing): Promise<string> {
  const choice = keepTripOrderUnlessChosen(readReportLayout(request.layout, report.namedColumns));
  const table = { ...report.table, layout: choice.layout };
  const { url, filename } = await storeExcelExport(storage, scope, createdAt, await buildReportWorkbook(table), 'bao-cao-chuyen');
  return JSON.stringify({ ok: true, url, filename, ...summarizeReport(report, pairing), layout: describeEffectiveLayout(choice, report.namedColumns), expires_hours: EXPORT_EXPIRES_HOURS });
}

function keepTripOrderUnlessChosen(choice: LayoutChoice): LayoutChoice {
  return choice.kind === 'chosen' ? choice : { ...choice, layout: { sort: [] } };
}

function listValueKeys(columns: TripColumn[]): string[] {
  return [...new Set(columns.flatMap(listColumnValueKeys))];
}

function listColumnValueKeys(column: TripColumn): string[] {
  if (column.source === 'knowledge_value' || column.source === 'knowledge_amount') return [column.matchKey];
  return column.source === 'field' && column.field === 'goods' ? [SHOWN_GOODS_MATCH_KEY] : [];
}

function summarizeReport(report: TripReport, pairing: TripPairing) {
  return {
    rows: report.counts.trips,
    ...summarizeTrips(report.counts),
    ...summarizeModelStep(pairing),
    rows_per_plate: report.rowsPerPlate,
    needs_review: report.reviewPapers,
    missing_weight: report.missingWeight,
    repeated_papers_left_out: report.repeatedPapers,
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
