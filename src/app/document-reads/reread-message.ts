import type { ReaderService } from '../../services/reading/reader-service.ts';
import type { Photo, PhotoStorage } from '../../services/storage/photo-storage.ts';
import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { listReaderCatalog } from '../documents/list-reader-catalog.ts';
import { storeDocuments } from '../documents/store-documents.ts';
import { planReply, type ReplyPlan } from '../intake/plan-reply.ts';
import { readWithReader } from '../intake/read-message.ts';
import { rejectDuplicates } from '../intake/run-reply-stage.ts';
import type { ReadAttempt } from '../reading/reading.ts';
import { listWorkspaceLabels } from '../records/list-workspace-labels.ts';
import { loadMessageToReread, type MessageToReread } from './load-message-to-reread.ts';
import { recordDocumentRead } from './record-document-read.ts';

export type RereadServices = { reader: ReaderService; photoStorage: PhotoStorage };

export type RereadFailureReason = 'reader_failed' | 'invalid_output' | 'photo_missing' | 'no_items';

export type MessageOutcome = 'saved' | 'no_document' | RereadFailureReason;

export async function rereadMessage(scoped: Database, services: RereadServices, messageId: string): Promise<MessageOutcome> {
  const message = await loadMessageToReread(scoped, messageId);
  if (message.imageKey === null) return readAndStore(scoped, services.reader, message, null);
  const photo = await services.photoStorage.get(message.imageKey);
  return photo === null ? 'photo_missing' : readAndStore(scoped, services.reader, message, photo);
}

async function readAndStore(scoped: Database, reader: ReaderService, message: MessageToReread, photo: Photo | null): Promise<MessageOutcome> {
  const attempt = await readAgain(scoped, reader, message, photo);
  if (!attempt.ok) return attempt.reason === 'invalid_output' ? 'invalid_output' : 'reader_failed';
  const plan = planReply(attempt, photo !== null);
  return plan.saved === null ? recordEmptyRead(scoped, message) : storeDocumentsAndRead(scoped, message, plan);
}

async function readAgain(scoped: Database, reader: ReaderService, message: MessageToReread, photo: Photo | null): Promise<ReadAttempt> {
  const { labels, catalog } = await runInTransaction(scoped, async (transaction) => ({
    labels: await listWorkspaceLabels(transaction, message.workspaceId),
    catalog: await listReaderCatalog(transaction, message.workspaceId),
  }));
  return readWithReader(reader, message.sentAt, { text: message.text, photo }, labels, catalog);
}

async function recordEmptyRead(scoped: Database, message: MessageToReread): Promise<MessageOutcome> {
  if (message.hasRecords) return 'no_items';
  await runInTransaction(scoped, (transaction) => recordDocumentRead(transaction, message, 'no_document'));
  return 'no_document';
}

async function storeDocumentsAndRead(scoped: Database, message: MessageToReread, plan: ReplyPlan): Promise<MessageOutcome> {
  return runInTransaction(scoped, async (transaction) => {
    const mayInsertDocuments = message.hasRecords || (await rejectDuplicates(transaction, message.workspaceId, plan)).saved !== null;
    await storeDocuments(transaction, message, plan, mayInsertDocuments);
    const outcome = (await hasSource(transaction, message.id)) ? 'saved' : 'no_document';
    await recordDocumentRead(transaction, message, outcome);
    return outcome;
  });
}

async function hasSource(transaction: Transaction, messageId: string): Promise<boolean> {
  const rows = await transaction.query('SELECT 1 FROM document_sources WHERE message_id = $1', [messageId]);
  return rows.length > 0;
}
