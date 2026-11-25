import type { PaperCorrector, PrintedValue } from './paper-correction.ts';
import { updatePrintedDetails } from './update-printed-details.ts';
import { writePrintedLine } from './write-printed-line.ts';

export async function setPrintedValue({ transaction, workspaceId }: PaperCorrector, paperId: string, printed: PrintedValue): Promise<void> {
  const label = await writePrintedLine(transaction, { workspaceId, paperId }, printed);
  await updatePrintedDetails(transaction, { workspaceId, paperId }, label, printed);
}
