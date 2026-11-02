import type { ChannelRecipient } from '../../services/messaging/messaging-channel.ts';
import { enqueueImage } from '../delivery/enqueue-image.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import type { Transaction } from '../db/transaction.ts';
import type { AttachablePhoto } from '../records/find-record-photos.ts';
import type { IntakeContext } from './intake-context.ts';

export async function enqueueReply(
  transaction: Transaction,
  context: IntakeContext,
  text: string,
  adminMembershipId?: string,
): Promise<void> {
  const { dependencies } = context;
  await enqueueText(transaction, {
    to: findRecipient(context),
    text,
    maxTextLength: dependencies.channel.maxTextLength,
    availableAt: dependencies.clock.now(),
    ...(adminMembershipId !== undefined && { adminMembershipId }),
  });
}

export async function enqueueReplyPhotos(
  transaction: Transaction,
  context: IntakeContext,
  photos: AttachablePhoto[],
  adminMembershipId: string,
): Promise<void> {
  for (const photo of photos) {
    await enqueueImage(transaction, {
      to: findRecipient(context),
      photoKey: photo.imageKey,
      availableAt: context.dependencies.clock.now(),
      adminMembershipId,
    });
  }
}

function findRecipient({ event }: IntakeContext): ChannelRecipient {
  return { channel: event.channel, accountId: event.accountId, externalUserId: event.externalUserId };
}
