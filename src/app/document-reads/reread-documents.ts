import { meterReader } from '../credits/meter-reader.ts';
import { scopeDatabase } from '../db/scoped-database.ts';
import type { Database } from '../db/transaction.ts';
import { findMessagesToReread } from './find-messages-to-reread.ts';
import { removeTestPhotoData } from './remove-test-photo-data.ts';
import { rereadMessage, type MessageOutcome, type RereadFailureReason, type RereadServices } from './reread-message.ts';

export type RereadFailure = { messageId: string; reason: RereadFailureReason };

export type RereadSummary = { stored: number; noDocument: number; testPhotos: number; failures: RereadFailure[] };

export async function rereadDocuments(
  database: Database,
  services: RereadServices,
  workspaceId: string,
  testPhotoIds: string[],
): Promise<RereadSummary> {
  const scoped = scopeDatabase(database, { workspaceId });
  const testPhotos = await removeTestPhotoData(scoped, workspaceId, testPhotoIds);
  const summary: RereadSummary = { stored: 0, noDocument: 0, testPhotos, failures: [] };
  const meter = { database: scoped, workspaceId, isCharged: false };
  const meteredServices = { ...services, reader: meterReader(services.reader, meter, () => 'operator_reread') };
  for (const messageId of await findMessagesToReread(scoped, workspaceId, testPhotoIds)) {
    countOutcome(summary, messageId, await rereadMessage(scoped, meteredServices, messageId));
  }
  return summary;
}

function countOutcome(summary: RereadSummary, messageId: string, outcome: MessageOutcome): void {
  if (outcome === 'saved') summary.stored += 1;
  else if (outcome === 'no_document') summary.noDocument += 1;
  else summary.failures.push({ messageId, reason: outcome });
}
