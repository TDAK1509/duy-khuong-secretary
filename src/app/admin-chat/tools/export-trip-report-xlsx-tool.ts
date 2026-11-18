import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { buildReportWorkbook } from '../../documents/build-report-workbook.ts';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import { isRealIsoDate } from '../../time/is-real-iso-date.ts';
import { buildTripReport, GOODS_VALUE_KEY, TRIP_FIELDS, type TripColumn, type TripReport } from '../../trips/build-trip-report.ts';
import { countReviewTripPapers, listKnownValues, listTripPapers, listWinningValues, type KnownValue, type TripPaperQuery } from '../../trips/list-trip-papers.ts';
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
  const resolved = resolveColumns(request.columns, await listKnownValues(dependencies.database, scope.workspaceId));
  if (!resolved.ok) return failTool(resolved.error);
  return exportTripReport(storage, dependencies.database, scope, { request, columns: resolved.columns });
}

function findRequestProblem({ title, date_from: dateFrom, date_to: dateTo, columns }: TripReportRequest): string | null {
  if (title.trim() === '' || title.length > MAX_TITLE_LENGTH) return `Tiêu đề cần có từ 1 đến ${MAX_TITLE_LENGTH} ký tự.`;
  if (!isRealIsoDate(dateFrom) || !isRealIsoDate(dateTo)) return INVALID_DATE_ERROR;
  if (dateFrom > dateTo) return 'Ngày bắt đầu phải trước ngày kết thúc.';
  if ((Date.parse(dateTo) - Date.parse(dateFrom)) / DAY_MS > MAX_DAYS) return `Báo cáo chuyến chỉ lấy tối đa ${MAX_DAYS} ngày. Hãy chia thành nhiều báo cáo.`;
  if (columns.length === 0 || columns.length > MAX_COLUMNS) return `Báo cáo cần có từ 1 đến ${MAX_COLUMNS} cột.`;
  return columns.map(findColumnProblem).find((columnProblem) => columnProblem !== null) ?? null;
}

function findColumnProblem({ name, source, field, value_name: valueName }: ColumnArgument): string | null {
  if (name.trim() === '' || name.length > MAX_COLUMN_NAME_LENGTH) return `Tên cột cần có từ 1 đến ${MAX_COLUMN_NAME_LENGTH} ký tự.`;
  if (source === 'field' && field === null) return `Cột "${name}" cần field.`;
  if ((source === 'fact_value' || source === 'fact_amount') && (valueName === null || buildMatchKey(valueName) === '')) return `Cột "${name}" cần value_name.`;
  return null;
}

function resolveColumns(columns: ColumnArgument[], known: KnownValue[]): ResolvedColumns {
  const resolved: TripColumn[] = [];
  for (const column of columns) {
    const result = resolveColumn(column, known);
    if (typeof result === 'string') return { ok: false, error: result };
    resolved.push(result);
  }
  return { ok: true, columns: resolved };
}

function resolveColumn({ name, source, field, value_name: valueName }: ColumnArgument, known: KnownValue[]): TripColumn | string {
  if (source === 'none') return { name, source };
  if (source === 'field') return { name, source, field: field! };
  const value = known.find((candidate) => candidate.match_key === buildMatchKey(valueName!));
  if (value === undefined) return `Không có giá trị "${valueName}" trong thông tin chuyến đã lưu. Các giá trị đã lưu: ${listNames(known)}.`;
  if (source === 'fact_amount' && !value.per_ton) return `Giá trị "${valueName}" không tính theo đ/tấn. Các giá trị theo đ/tấn: ${listNames(known.filter((candidate) => candidate.per_ton))}.`;
  return { name, source, matchKey: value.match_key };
}

function listNames(values: KnownValue[]): string {
  return values.length === 0 ? 'không có' : values.map((value) => value.name).join(', ');
}

type PlannedReport = { request: TripReportRequest; columns: TripColumn[] };

async function exportTripReport(storage: FileStorage, database: Database, scope: AccessScope, { request, columns }: PlannedReport): Promise<string> {
  const query: TripPaperQuery = { workspaceId: scope.workspaceId, dateFrom: request.date_from, dateTo: request.date_to, plate: request.plate, limit: MAX_ROWS + 1 };
  const papers = await listTripPapers(database, query);
  if (papers.length > MAX_ROWS) return failTool(`Có hơn ${MAX_ROWS} giấy tờ chuyến trong khoảng này. Hãy chọn khoảng ngắn hơn hoặc một xe.`);
  if (papers.length === 0) return JSON.stringify({ ok: false, reason: 'no_matches' });
  const winners = await listWinningValues(database, scope.workspaceId, papers.map((paper) => paper.id), listValueKeys(columns));
  const report = buildTripReport(request.title, columns, papers, winners, await countReviewTripPapers(database, query));
  const { url, filename } = await storeExcelExport(storage, scope.workspaceId, await buildReportWorkbook(report.table), 'bao-cao-chuyen');
  return JSON.stringify({ ok: true, url, filename, ...summarizeReport(report), expires_hours: EXPORT_EXPIRES_HOURS });
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
  };
}
