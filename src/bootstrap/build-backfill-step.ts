import type { Database } from '../app/db/transaction.ts';
import { HeldBackfills } from '../app/template-backfills/held-backfills.ts';
import { runBackfillStep } from '../app/template-backfills/run-backfill-step.ts';
import type { Clock } from '../services/clock/clock.ts';
import type { MessagingChannel } from '../services/messaging/messaging-channel.ts';
import type { ReaderService } from '../services/reading/reader-service.ts';
import type { PhotoStorage } from '../services/storage/photo-storage.ts';

export type BackfillStepParts = { database: Database; clock: Clock; channel: MessagingChannel | null; photoStorage: PhotoStorage | null; reader: ReaderService | null; log: (line: string) => void };

export type BackfillSteps = {
  runBackfillStep: (() => Promise<'processed' | 'idle'>) | null;
  heldBackfills: HeldBackfills;
};

export function buildBackfillStep({ database, clock, channel, photoStorage, reader, log }: BackfillStepParts): BackfillSteps {
  const heldBackfills = new HeldBackfills();
  const missing = [...(channel ? [] : ['zalo']), ...(photoStorage ? [] : ['photos']), ...(reader ? [] : ['readers'])];
  if (missing.length > 0) log(`[config] template-backfill is off; missing: ${missing.join(', ')}.`);
  if (!channel || !photoStorage || !reader) return { runBackfillStep: null, heldBackfills };
  const dependencies = { database, clock, maxTextLength: channel.maxTextLength, reader, photoStorage, held: heldBackfills };
  return { runBackfillStep: () => runBackfillStep(dependencies), heldBackfills };
}
