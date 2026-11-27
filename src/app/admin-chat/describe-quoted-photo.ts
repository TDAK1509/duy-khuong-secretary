import { runInTransaction, type Database } from '../db/transaction.ts';
import { findQuotedPhotoMessage, type QuotingMessage } from '../documents/corrections/find-quoted-photo-message.ts';
import { formatQuotedPapers } from './format-quoted-papers.ts';
import { loadQuotedPapers } from './load-quoted-papers.ts';

export async function describeQuotedPhoto(database: Database, quoting: QuotingMessage): Promise<string | null> {
  if (!(await hasQuote(database, quoting.currentMessageId))) return null;
  return runInTransaction(database, async (transaction) => {
    const photoMessageId = await findQuotedPhotoMessage(transaction, quoting);
    if (photoMessageId === null) return null;
    return formatQuotedPapers(await loadQuotedPapers(transaction, quoting.workspaceId, photoMessageId));
  });
}

async function hasQuote(database: Database, messageId: string): Promise<boolean> {
  const { rows } = await database.query<{ quoted_id: string | null }>(
    `SELECT event.payload->>'quote_msg_id' AS quoted_id
     FROM messages message JOIN inbound_events event ON event.id = message.inbound_event_id
     WHERE message.id = $1`,
    [messageId],
  );
  return typeof rows[0]?.quoted_id === 'string';
}
