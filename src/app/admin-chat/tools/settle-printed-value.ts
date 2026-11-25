import type { Transaction } from '../../db/transaction.ts';
import { findPrintedLine, type PrintedLine } from '../../documents/corrections/find-printed-line.ts';
import type { FoundPaper, PrintedValue } from '../../documents/corrections/paper-correction.ts';
import { applyLoadWeightRules, isLoadWeightKey, isLoadWeightPrinted } from './load-weight-rules.ts';
import { ToolRefusal } from './tool-result.ts';

const ERASED_NUMBER_ERROR = 'Mục này đang lưu là một con số, mà giá trị mới không có con số. Chưa đổi gì. Gọi lại với printed_number, printed_unit và printed_meaning theo đúng lời quản lý, hoặc hỏi quản lý con số và đơn vị đúng.';

export async function settlePrintedValue(transaction: Transaction, workspaceId: string, papers: FoundPaper[], printed: PrintedValue | null): Promise<PrintedValue | null> {
  const [paper] = papers;
  if (printed === null || paper === undefined) return printed;
  const line = await findPrintedLine(transaction, workspaceId, paper.id, printed);
  if (isStoredLoadWeight(line) && !isLoadWeightPrinted(printed)) return applyLoadWeightRules(printed);
  if (printed.number === null && line?.number != null) throw new ToolRefusal(ERASED_NUMBER_ERROR);
  return printed;
}

function isStoredLoadWeight(line: PrintedLine | null): boolean {
  return line !== null && isLoadWeightKey(line.meaning_key);
}
