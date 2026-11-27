import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { deleteSavedPapers, type SavedPaper } from '../../documents/saved-papers.ts';
import { failTool, ToolRefusal } from './tool-result.ts';

export const PAPER_NOT_FOUND_ERROR = 'Không tìm thấy giấy tờ có id này. Lấy id từ thẻ quoted-photo hoặc gọi list_documents. Chưa xóa giấy tờ nào.';

const MAX_PAPERS = 20;

const argumentsSchema = z.strictObject({ document_ids: z.array(z.string()).min(1).max(MAX_PAPERS) });
const uuidSchema = z.uuid();

export function listPaperIds(parsedArguments: unknown): string[] {
  const { document_ids: documentIds } = argumentsSchema.parse(parsedArguments);
  if (!documentIds.every((id) => uuidSchema.safeParse(id).success)) throw new ToolRefusal(PAPER_NOT_FOUND_ERROR);
  return [...new Set(documentIds)];
}

export async function runDeleteDocument(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const deleted = await deleteSavedPapers(database, scope.workspaceId, listPaperIds(parsedArguments));
  if (deleted === null) return failTool(PAPER_NOT_FOUND_ERROR);
  return JSON.stringify({ ok: true, deleted_count: deleted.length, deleted: deleted.map(describeDeletedPaper) });
}

function describeDeletedPaper(paper: SavedPaper): Record<string, string | null> {
  return { kind: paper.kind, title: paper.title, plate: paper.plate, document_number: paper.documentNumber, document_date: paper.documentDate };
}
