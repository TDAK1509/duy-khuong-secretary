import { runInTransaction, type Database } from '../db/transaction.ts';
import { findQuotedPhotoMessage, type QuotingMessage } from '../documents/corrections/find-quoted-photo-message.ts';
import { formatQuotedPapers } from './format-quoted-papers.ts';
import { loadQuotedPapers } from './load-quoted-papers.ts';

export function describeQuotedPhoto(database: Database, quoting: QuotingMessage): Promise<string | null> {
  return runInTransaction(database, async (transaction) => {
    const photoMessageId = await findQuotedPhotoMessage(transaction, quoting);
    if (photoMessageId === null) return null;
    return formatQuotedPapers(await loadQuotedPapers(transaction, quoting.workspaceId, photoMessageId));
  });
}
