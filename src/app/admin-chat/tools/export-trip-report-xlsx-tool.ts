import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { buildReportWorkbook } from '../../documents/build-report-workbook.ts';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import { isRealIsoDate } from '../../time/is-real-iso-date.ts';
import { buildTripReport, GOODS_VALUE_KEY, TRIP_FIELDS, type TripColumn, type TripReport } from '../../trips/build-trip-report.ts';
import { countReviewTripPapers, listKnownValues, listTripPapers, listWinningValues, type KnownValue, type TripPaperQuery } from '../../trips/list-trip-papers.ts';
import type { ReaderService } from '../../../services/reading/reader-service.ts';
import type { FileStorage } from '../../../services/storage/file-storage.ts';
import { inferDropOffs, type DropOffInference } from '../../trips/infer-drop-offs.ts';
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
  const papers = await listTripPapers(database, query);
  if (papers.length > MAX_ROWS) return failTool(`Có hơn ${MAX_ROWS} giấy tờ chuyến trong khoảng này. Hãy chọn khoảng ngắn hơn hoặc một xe.`);
  if (papers.length === 0) return JSON.stringify({ ok: false, reason: 'no_matches' });
  const winners = await listWinningValues(database, scope.workspaceId, papers.map((paper) => paper.id), listValueKeys(columns));
  const dropOffs = hasRouteColumn(columns) ? await inferDropOffs(database, dropOffReader, { workspaceId: scope.workspaceId, dateFrom: request.date_from, dateTo: request.date_to, papers }) : null;
  const report = buildTripReport({ title: request.title, createdAt, columns, papers, winners, reviewPapers: await countReviewTripPapers(database, query), dropOffs });
  const { url, filename } = await storeExcelExport(storage, scope.workspaceId, await buildReportWorkbook(report.table), 'bao-cao-chuyen');
  return JSON.stringify({ ok: true, url, filename, ...summarizeReport(report), expires_hours: EXPORT_EXPIRES_HOURS });
}

function hasRouteColumn(columns: TripColumn[]): boolean {
  return columns.some((column) => column.source === 'field' && column.field === 'route');
}

function listValueKeys(columns: TripColumn[]): string[] {
  const keys = columns.flatMap((column) => (column.source === 'fact_value' || column.source === 'fact_amount' ? [column.matchKey] : []));
  return [...new Set([...keys, GOODS_VALUE_KEY])];
}

function summarizeReport(report: TripReport) {
  return {
    rows: report.table.rows.length,
    rows_per_plate: report.rowsPerPlate,
    needs_review: report.reviewPapers,
    missing_weight: report.missingWeight,
    possible_duplicates: report.duplicates.length,
    empty_columns: [...report.noSourceColumns, ...report.emptyColumns],
    ...(report.dropOffs === null ? {} : summarizeDropOffs(report.dropOffs)),
  };
}

function summarizeDropOffs({ inferred, stillUnknown }: DropOffInference) {
  const pairs = [...inferred.values()];
  return {
    inferred_rule: pairs.filter((pair) => pair.method === 'rule').length,
    inferred_ai: pairs.filter((pair) => pair.method === 'ai').length,
    still_unknown: stillUnknown,
  };
}
