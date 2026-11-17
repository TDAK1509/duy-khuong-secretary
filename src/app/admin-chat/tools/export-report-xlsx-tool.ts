import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import { buildReportWorkbook, type ReportTable } from '../../documents/build-report-workbook.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';
import { EXPORT_EXPIRES_HOURS, EXPORT_NOT_CONFIGURED_ERROR, storeExcelExport } from './store-excel-export.ts';
import { failTool, REFUSAL_ERROR } from './tool-result.ts';

const MAX_COLUMNS = 50;
const MAX_ROWS = 5000;

const argumentsSchema = z.strictObject({
  title: z.string(),
  columns: z.array(z.strictObject({ name: z.string(), type: z.enum(['number', 'text']) })),
  rows: z.array(z.array(z.string().nullable())),
});

export async function runExportReportXlsx(dependencies: AdminToolDependencies, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  if (scope.role !== 'admin') return failTool(REFUSAL_ERROR);
  const storage = dependencies.fileStorage ?? null;
  if (storage === null) return failTool(EXPORT_NOT_CONFIGURED_ERROR);
  const request = argumentsSchema.parse(parsedArguments);
  const problem = findTableProblem(request);
  if (problem !== null) return failTool(problem);
  const table = { ...request, rows: request.rows.map((cells) => readCells(request.columns, cells)) };
  const { url, filename } = await storeExcelExport(storage, scope.workspaceId, await buildReportWorkbook(table), 'bao-cao');
  return JSON.stringify({ ok: true, url, filename, rows: table.rows.length, expires_hours: EXPORT_EXPIRES_HOURS });
}

type TableRequest = z.infer<typeof argumentsSchema>;

function findTableProblem({ title, columns, rows }: TableRequest): string | null {
  if (title.trim() === '') return 'Bảng cần có tiêu đề.';
  if (columns.length === 0) return 'Bảng cần có ít nhất một cột.';
  if (columns.length > MAX_COLUMNS) return `Bảng có ${columns.length} cột, tối đa ${MAX_COLUMNS} cột.`;
  if (rows.length === 0) return 'Bảng cần có ít nhất một dòng.';
  if (rows.length > MAX_ROWS) return `Bảng có ${rows.length} dòng, tối đa ${MAX_ROWS} dòng.`;
  for (const [index, cells] of rows.entries()) {
    const problem = findRowProblem(columns, cells, index + 1);
    if (problem !== null) return problem;
  }
  return null;
}

function findRowProblem(columns: TableRequest['columns'], cells: (string | null)[], rowNumber: number): string | null {
  if (cells.length !== columns.length) return `Dòng ${rowNumber} có ${cells.length} ô nhưng bảng có ${columns.length} cột.`;
  const textInNumberColumn = columns.findIndex((column, index) => column.type === 'number' && !isNumberCell(cells[index] ?? null));
  if (textInNumberColumn === -1) return null;
  return `Cột "${columns[textInNumberColumn]?.name}" là cột số nhưng dòng ${rowNumber} có chữ "${cells[textInNumberColumn]}".`;
}

const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

function isNumberCell(cell: string | null): boolean {
  return cell === null || PLAIN_NUMBER.test(cell.trim());
}

function readCells(columns: TableRequest['columns'], cells: (string | null)[]): ReportTable['rows'][number] {
  return cells.map((cell, index) => (cell !== null && columns[index]?.type === 'number' ? Number(cell.trim()) : cell));
}
