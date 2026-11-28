import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { buildDocumentsWorkbook, type ExportRow } from '../../documents/build-documents-workbook.ts';
import { ACCEPTED_CONFIRMED, buildDocumentWhere } from '../../documents/build-document-where.ts';
import type { DocumentFilters } from '../../documents/add-document-filters.ts';
import { buildDocumentKnowledgeSql, type DocumentKnowledge } from '../../facts/document-knowledge.ts';
import type { WhereClause } from '../../records/where-clause.ts';
import type { FileStorage } from '../../../services/storage/file-storage.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';
import { buildDocumentFilters, DOCUMENT_FILTER_ARGUMENTS, hasUnrealDate, type DocumentFilterArguments } from './document-filter-arguments.ts';
import { failTool, INVALID_DATE_ERROR, REFUSAL_ERROR } from './tool-result.ts';
import { EXPORT_EXPIRES_HOURS, EXPORT_NOT_CONFIGURED_ERROR, storeExcelExport } from './store-excel-export.ts';

const argumentsSchema = z.object(DOCUMENT_FILTER_ARGUMENTS);

export async function runExportDocumentsXlsx(dependencies: AdminToolDependencies, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  if (scope.role !== 'admin') return failTool(REFUSAL_ERROR);
  const storage = dependencies.fileStorage ?? null;
  if (storage === null) return failTool(EXPORT_NOT_CONFIGURED_ERROR);
  const args = argumentsSchema.parse(parsedArguments);
  if (hasUnrealDate(args)) return failTool(INVALID_DATE_ERROR);
  return executeExport(storage, dependencies, scope, { filters: buildDocumentFilters(args), describedFilter: describeFilter(args) });
}

type ExportRequest = { filters: DocumentFilters; describedFilter: string };

async function executeExport(storage: FileStorage, { database, clock }: AdminToolDependencies, scope: AccessScope, { filters, describedFilter }: ExportRequest): Promise<string> {
  const rows = await queryExportRows(database, scope, filters);
  if (rows.length === 0) return JSON.stringify({ ok: false, reason: 'no_matches', described_filter: describedFilter });
  const createdAt = clock.now();
  const bytes = await buildDocumentsWorkbook({ title: describedFilter, createdAt, rows });
  const { url, filename } = await storeExcelExport(storage, scope, createdAt, bytes, 'giay-to');
  return JSON.stringify({ ok: true, url, filename, count: rows.length, described_filter: describedFilter, expires_hours: EXPORT_EXPIRES_HOURS });
}

type DocumentExportRow = {
  document_date: string | null;
  kind: string;
  title: string | null;
  document_number: string | null;
  vehicle_plate: string | null;
  amount_vnd: number | null;
  sender_name: string | null;
  company_knowledge: DocumentKnowledge[];
};

async function queryExportRows(database: Database, scope: AccessScope, filters: DocumentFilters): Promise<ExportRow[]> {
  const where = buildDocumentWhere(scope.workspaceId, filters, ACCEPTED_CONFIRMED);
  const { rows } = await database.query<DocumentExportRow>(buildExportSql(where), where.values);
  return rows;
}

function buildExportSql(where: WhereClause): string {
  return `
    SELECT
      to_char(document.document_date, 'YYYY-MM-DD') AS document_date,
      document.kind, document.title, document.document_number, document.vehicle_plate,
      ${buildAmountSubquery()} AS amount_vnd,
      ${buildSenderSubquery()} AS sender_name,
      ${buildDocumentKnowledgeSql()} AS company_knowledge
    FROM documents document
    WHERE ${where.toSql()}
    ORDER BY document.document_date DESC NULLS LAST, document.created_at DESC
  `;
}

function buildAmountSubquery(): string {
  return `(SELECT dl.number::float8 FROM document_lines dl
     WHERE dl.document_id = document.id AND dl.workspace_id = document.workspace_id
       AND dl.item IS NULL AND dl.unit = 'vnd' ORDER BY dl.line_no LIMIT 1)`;
}

export function buildSenderSubquery(): string {
  return `(SELECT mem.display_name FROM document_sources ds
     JOIN messages msg ON msg.id = ds.message_id AND msg.workspace_id = document.workspace_id
     JOIN memberships mem ON mem.user_id = msg.user_id AND mem.workspace_id = document.workspace_id
     WHERE ds.document_id = document.id AND ds.workspace_id = document.workspace_id
     ORDER BY ds.created_at LIMIT 1)`;
}

function describeFilter(args: DocumentFilterArguments): string {
  const parts: string[] = [];
  if (args.date_from !== null || args.date_to !== null) parts.push(describeDateRange(args));
  if (args.plate !== null) parts.push(`xe ${args.plate}`);
  if (args.kind !== null) parts.push(`loại ${args.kind}`);
  if (args.organization !== null) parts.push(`công ty ${args.organization}`);
  if (args.stage === 'dispatch') parts.push('giao hàng');
  if (args.stage === 'receipt') parts.push('nhận hàng');
  return parts.length > 0 ? `Giấy tờ ${parts.join(', ')}` : 'Toàn bộ giấy tờ';
}

function describeDateRange(args: DocumentFilterArguments): string {
  if (args.date_from !== null && args.date_to !== null) return `từ ${formatDateVn(args.date_from)} đến ${formatDateVn(args.date_to)}`;
  if (args.date_from !== null) return `từ ${formatDateVn(args.date_from)}`;
  return `đến ${formatDateVn(args.date_to!)}`;
}

function formatDateVn(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}
