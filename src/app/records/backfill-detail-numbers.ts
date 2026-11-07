import type { ReaderService } from '../../services/reading/reader-service.ts';
import { scopeDatabase } from '../db/scoped-database.ts';
import type { Database } from '../db/transaction.ts';
import { buildDetailNumbersRequest, type StoredDetail } from '../reading/detail-numbers-request.ts';
import { mergeDetailNumbers } from './merge-detail-numbers.ts';
import { FIRST_RECORD_ID, findRecordsWithoutNumbers, type RecordWithoutNumbers } from './records-without-numbers.ts';

export type BackfillFailureReason = 'reader_failed' | 'invalid_output' | 'changed_during_run';

export type BackfillFailure = { recordId: string; reason: BackfillFailureReason };

export type BackfillSummary = { checked: number; added: number; failures: BackfillFailure[] };

export async function backfillDetailNumbers(
  database: Database,
  reader: ReaderService,
  workspaceId: string,
): Promise<BackfillSummary> {
  const scoped = scopeDatabase(database, { workspaceId });
  const failures: BackfillFailure[] = [];
  let checked = 0;
  let afterId = FIRST_RECORD_ID;
  for (;;) {
    const batch = await findRecordsWithoutNumbers(database, workspaceId, afterId);
    const lastRecord = batch.at(-1);
    if (lastRecord === undefined) return { checked, added: checked - failures.length, failures };
    failures.push(...(await backfillBatch(scoped, reader, batch)));
    checked += batch.length;
    afterId = lastRecord.id;
  }
}

async function backfillBatch(
  scoped: Database,
  reader: ReaderService,
  batch: RecordWithoutNumbers[],
): Promise<BackfillFailure[]> {
  const failures: BackfillFailure[] = [];
  for (const record of batch) {
    const reason = await addNumbers(scoped, reader, record);
    if (reason !== null) failures.push({ recordId: record.id, reason });
  }
  return failures;
}

async function addNumbers(
  scoped: Database,
  reader: ReaderService,
  record: RecordWithoutNumbers,
): Promise<BackfillFailureReason | null> {
  const reply = await reader.read(buildDetailNumbersRequest(record.details));
  if (!reply.ok) return 'reader_failed';
  const details = mergeDetailNumbers(record.details, reply.json);
  if (details === null) return 'invalid_output';
  const updated = await replaceDetailsIfUnchanged(scoped, record, details);
  return updated ? null : 'changed_during_run';
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
