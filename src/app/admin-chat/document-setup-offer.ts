import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';

const OFFER_REMEMBERED_MS = 7 * 24 * 60 * 60 * 1000;

const OFFER_MADE_PROFILE_LINE = 'Trợ lý đã đề nghị khai báo các loại giấy tờ của công ty. Nếu quản lý trả lời ngắn như "có" hoặc "ok", đó là đồng ý với đề nghị này.';

export async function claimDocumentSetupOffer(transaction: Transaction, sender: { workspaceId: string; membershipId: string }, now: Date): Promise<boolean> {
  if (await hasDocumentTemplate(transaction, sender.workspaceId)) return false;
  const claimed = await transaction.query(
    'UPDATE memberships SET document_setup_offered_at = $2 WHERE id = $1 AND document_setup_offered_at IS NULL RETURNING id',
    [sender.membershipId, now],
  );
  return claimed.length > 0;
}

export async function listOfferMadeProfileLines(database: Database, workspaceId: string, offeredAt: Date | null, now: Date): Promise<string[]> {
  if (offeredAt === null || now.getTime() - offeredAt.getTime() > OFFER_REMEMBERED_MS) return [];
  const hasTemplate = await runInTransaction(database, (transaction) => hasDocumentTemplate(transaction, workspaceId));
  return hasTemplate ? [] : [OFFER_MADE_PROFILE_LINE];
}

export function hasDocumentTemplate(transaction: Transaction, workspaceId: string): Promise<boolean> {
  return transaction.withScope({ workspaceId }, async () => {
    const rows = await transaction.query('SELECT 1 FROM document_templates WHERE workspace_id = $1 LIMIT 1', [workspaceId]);
    return rows.length > 0;
  });
}
