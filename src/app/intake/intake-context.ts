import type { Clock } from '../../services/clock/clock.ts';
import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import type { PhotoStorage } from '../../services/storage/photo-storage.ts';
import type { Database } from '../db/transaction.ts';
import type { ClaimedEvent } from '../processing/claimed-event.ts';
import type { Stages } from '../processing/stages.ts';
import type { ReaderSlots } from '../reading/decide-reading.ts';
import type { IntakeSender } from './find-intake-sender.ts';

export type IntakeDependencies = {
  channel: MessagingChannel;
  clock: Clock;
  database: Database;
  photoStorage: PhotoStorage | null;
  readers: ReaderSlots | null;
};

export type IntakeContext = {
  dependencies: IntakeDependencies;
  readers: ReaderSlots;
  stages: Stages;
  event: ClaimedEvent;
  sender: IntakeSender;
};
