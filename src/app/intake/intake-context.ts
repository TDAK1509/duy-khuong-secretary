import type { ChatService } from '../../services/chat/chat-service.ts';
import type { Clock } from '../../services/clock/clock.ts';
import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import type { ReaderService } from '../../services/reading/reader-service.ts';
import type { PhotoStorage } from '../../services/storage/photo-storage.ts';
import type { Database } from '../db/transaction.ts';
import type { ClaimedEvent } from '../processing/claimed-event.ts';
import type { Stages } from '../processing/stages.ts';
import type { IntakeSender } from './find-intake-sender.ts';

export type IntakeDependencies = {
  channel: MessagingChannel;
  clock: Clock;
  database: Database;
  photoStorage: PhotoStorage | null;
  reader: ReaderService | null;
  chat: ChatService | null;
};

export type IntakeContext = {
  dependencies: IntakeDependencies;
  reader: ReaderService;
  stages: Stages;
  event: ClaimedEvent;
  sender: IntakeSender;
};
