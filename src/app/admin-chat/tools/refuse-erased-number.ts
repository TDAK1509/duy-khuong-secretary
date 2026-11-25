import type { Transaction } from '../../db/transaction.ts';
import { findPrintedLine } from '../../documents/corrections/find-printed-line.ts';
import type { FoundPaper, PrintedValue } from '../../documents/corrections/paper-correction.ts';
import { ToolRefusal } from './tool-result.ts';

const ERASED_NUMBER_ERROR = 'Mục này đang lưu là một con số, mà giá trị mới không có con số. Chưa đổi gì. Gọi lại với printed_number, printed_unit và printed_meaning theo đúng lời quản lý, hoặc hỏi quản lý con số và đơn vị đúng.';

export async function refuseErasedNumber(transaction: Transaction, workspaceId: string, paper: FoundPaper, printed: PrintedValue | null): Promise<void> {
  if (printed === null || printed.number !== null) return;
  const line = await findPrintedLine(transaction, workspaceId, paper.id, printed);
  if (line?.number != null) throw new ToolRefusal(ERASED_NUMBER_ERROR);
}
