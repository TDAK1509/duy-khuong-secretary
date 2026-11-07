import type { ReaderService } from '../../services/reading/reader-service.ts';
import { scopeDatabase } from '../db/scoped-database.ts';
import type { Database } from '../db/transaction.ts';
import { buildDetailNumbersRequest } from '../reading/detail-numbers-request.ts';
import { mergeDetailNumbers } from './merge-detail-numbers.ts';
import { findRecordsWithoutNumbers, type RecordWithoutNumbers } from './records-without-numbers.ts';

export type BackfillSummary = { checked: number; added: number };

export async function backfillDetailNumbers(
  database: Database,
  reader: ReaderService,
  workspaceId: string,
): Promise<BackfillSummary> {
  const scoped = scopeDatabase(database, { workspaceId });
  const records = await findRecordsWithoutNumbers(database, workspaceId);
  for (const record of records) await addNumbers(scoped, reader, record);
  return { checked: records.length, added: records.length };
}

async function addNumbers(scoped: Database, reader: ReaderService, record: RecordWithoutNumbers): Promise<void> {
  const reply = await reader.read(buildDetailNumbersRequest(record.details));
  if (!reply.ok) return;
  const details = mergeDetailNumbers(record.details, reply.json);
  await scoped.query('UPDATE records SET details = $1::jsonb WHERE id = $2', [JSON.stringify(details), record.id]);
}
