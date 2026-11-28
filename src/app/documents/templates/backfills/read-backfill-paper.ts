import type { Clock } from '../../../../services/clock/clock.ts';
import type { ReaderService } from '../../../../services/reading/reader-service.ts';
import type { Photo, PhotoStorage } from '../../../../services/storage/photo-storage.ts';
import { meterReader } from '../../../credits/meter-reader.ts';
import { scopeDatabase } from '../../../db/scoped-database.ts';
import type { Database } from '../../../db/transaction.ts';
import { loadMessageToReread, type MessageToReread } from '../../rereads/load-message-to-reread.ts';
import { readAgain } from '../../rereads/reread-message.ts';
import { groupItems, pairItemsWithRecords, type DocumentDraft } from '../../document-draft.ts';
import { planReply } from '../../../intake/plan-reply.ts';
import type { ReadAttempt } from '../../../reading/reading.ts';

export type PaperRead = { kind: 'skipped' } | { kind: 'failed' } | { kind: 'read'; messageId: string; drafts: DocumentDraft[] };

export type PaperReaderDependencies = { database: Database; clock: Clock; maxTextLength: number; reader: ReaderService; photoStorage: PhotoStorage };

export type PaperToRead = { workspaceId: string; paperId: string };

type PhotoMessage = { message: MessageToReread; photo: Photo };

export class PaperReadFailedError extends Error {
  constructor(paperId: string, reason: string) {
    super(`the reader could not read paper ${paperId}: ${reason}`);
    this.name = 'PaperReadFailedError';
  }
}

const FIND_PHOTO_MESSAGE_SQL = `
  SELECT source.message_id
  FROM document_sources source
  JOIN messages message ON message.id = source.message_id AND message.workspace_id = source.workspace_id
  WHERE source.document_id = $1 AND source.workspace_id = $2 AND message.image_key IS NOT NULL AND message.image_deleted_at IS NULL
  ORDER BY source.created_at, source.id
  LIMIT 1`;

export async function readBackfillPaper(dependencies: PaperReaderDependencies, target: PaperToRead): Promise<PaperRead> {
  const scoped = scopeDatabase(dependencies.database, { workspaceId: target.workspaceId });
  const found = await findPhotoMessage(dependencies.photoStorage, scoped, target);
  if (found === null) return { kind: 'skipped' };
  const services = { reader: buildMeteredReader(dependencies, scoped, target.workspaceId), photoStorage: dependencies.photoStorage };
  const attempt = await readAgain(scoped, services, found.message, found.photo);
  if (!attempt.ok) return failRead(target.paperId, attempt.reason);
  return { kind: 'read', messageId: found.message.id, drafts: draftReading(attempt) };
}

async function findPhotoMessage(photoStorage: PhotoStorage, scoped: Database, { workspaceId, paperId }: PaperToRead): Promise<PhotoMessage | null> {
  const { rows: [source] } = await scoped.query<{ message_id: string }>(FIND_PHOTO_MESSAGE_SQL, [paperId, workspaceId]);
  if (source === undefined) return null;
  const message = await loadMessageToReread(scoped, source.message_id);
  const photo = message.imageKey === null ? null : await photoStorage.get(message.imageKey);
  return photo === null ? null : { message, photo };
}

function buildMeteredReader({ reader, clock, maxTextLength }: PaperReaderDependencies, scoped: Database, workspaceId: string): ReaderService {
  return meterReader(reader, { database: scoped, workspaceId, charged: { clock, maxTextLength } }, () => 'template_backfill');
}

function failRead(paperId: string, reason: 'timeout' | 'invalid_output' | 'unavailable'): PaperRead {
  if (reason === 'invalid_output') return { kind: 'failed' };
  throw new PaperReadFailedError(paperId, reason);
}

function draftReading(attempt: Extract<ReadAttempt, { ok: true }>): DocumentDraft[] {
  const plan = planReply(attempt, true);
  return plan.saved === null ? [] : groupItems(pairItemsWithRecords(plan.readItems, plan.saved));
}
