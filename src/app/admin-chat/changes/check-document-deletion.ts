import { runInTransaction } from '../../db/transaction.ts';
import { findSavedPapers, type SavedPaper } from '../../documents/saved-papers.ts';
import { listPaperIds, PAPER_NOT_FOUND_ERROR } from '../tools/delete-document-tool.ts';
import { ToolRefusal } from '../tools/tool-result.ts';
import type { RiskyChecker } from './risky-check.ts';

export const checkDocumentDeletion: RiskyChecker = async ({ database }, scope, parsedArguments) => {
  const paperIds = listPaperIds(parsedArguments);
  const papers = await runInTransaction(database, (transaction) => findSavedPapers(transaction, scope.workspaceId, paperIds));
  if (papers === null) throw new ToolRefusal(PAPER_NOT_FOUND_ERROR);
  const question = [`Xóa hẳn ${papers.length} giấy tờ đã lưu:`, ...papers.map(describePaperLine), 'Ảnh gốc vẫn giữ nguyên. Không hoàn tác được.'].join('\n');
  return { targets: null, writeQuestion: () => question };
};

function describePaperLine({ kind, title, plate, documentNumber, documentDate }: SavedPaper): string {
  const parts = [title ?? kind, plate === null ? null : `xe ${plate}`, documentNumber === null ? null : `số ${documentNumber}`, documentDate === null ? null : `ngày ${documentDate}`];
  return parts.filter((part) => part !== null).join(', ');
}
