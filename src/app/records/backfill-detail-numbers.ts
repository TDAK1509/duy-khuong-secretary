import type { ReaderService } from '../../services/reading/reader-service.ts';
import { scopeDatabase } from '../db/scoped-database.ts';
import type { Database } from '../db/transaction.ts';
import { buildDetailNumbersRequest, type StoredDetail } from '../reading/detail-numbers-request.ts';
import { gainsNumber, mergeDetailNumbers } from './merge-detail-numbers.ts';
import { FIRST_RECORD_ID, findRecordsWithoutNumbers, type RecordWithoutNumbers } from './records-without-numbers.ts';

export type BackfillFailureReason = 'reader_failed' | 'invalid_output' | 'changed_during_run';

export type BackfillFailure = { recordId: string; reason: BackfillFailureReason };

export type BackfillSummary = { checked: number; added: number; failures: BackfillFailure[] };

type RecordOutcome = BackfillFailureReason | 'added' | 'unchanged';

type BatchSummary = { added: number; failures: BackfillFailure[] };

export async function backfillDetailNumbers(
  database: Database,
  reader: ReaderService,
  workspaceId: string,
): Promise<BackfillSummary> {
  const scoped = scopeDatabase(database, { workspaceId });
  const failures: BackfillFailure[] = [];
  let checked = 0;
  let added = 0;
  let afterId = FIRST_RECORD_ID;
  for (;;) {
    const batch = await findRecordsWithoutNumbers(database, workspaceId, afterId);
    const lastRecord = batch.at(-1);
    if (lastRecord === undefined) return { checked, added, failures };
    const summary = await backfillBatch(scoped, reader, batch);
    failures.push(...summary.failures);
    added += summary.added;
    checked += batch.length;
    afterId = lastRecord.id;
  }
}

async function backfillBatch(
  scoped: Database,
  reader: ReaderService,
  batch: RecordWithoutNumbers[],
): Promise<BatchSummary> {
  const summary: BatchSummary = { added: 0, failures: [] };
  for (const record of batch) {
    const outcome = await addNumbers(scoped, reader, record);
    if (outcome === 'added') summary.added += 1;
    else if (outcome !== 'unchanged') summary.failures.push({ recordId: record.id, reason: outcome });
  }
  return summary;
}

async function addNumbers(scoped: Database, reader: ReaderService, record: RecordWithoutNumbers): Promise<RecordOutcome> {
  const reply = await reader.read(buildDetailNumbersRequest(record.details));
  if (!reply.ok) return 'reader_failed';
  const details = mergeDetailNumbers(record.details, reply.json);
  if (details === null) return 'invalid_output';
  if (!gainsNumber(record.details, details)) return 'unchanged';
  const updated = await replaceDetailsIfUnchanged(scoped, record, details);
  return updated ? 'added' : 'changed_during_run';
}

async function replaceDetailsIfUnchanged(
  scoped: Database,
  record: RecordWithoutNumbers,
  details: StoredDetail[],
): Promise<boolean> {
  const result = await scoped.query(
    'UPDATE records SET details = $1::jsonb WHERE id = $2 AND details = $3::jsonb',
    [JSON.stringify(details), record.id, JSON.stringify(record.details)],
  );
  return result.rowCount === 1;
}
