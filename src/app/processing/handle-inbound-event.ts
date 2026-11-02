import { z } from 'zod';
import type { Clock } from '../../services/clock/clock.ts';
import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import type { Database } from '../db/transaction.ts';
import { isInviteCodeMessage } from '../workspaces/invite-code.ts';
import { joinWithInviteCode } from '../workspaces/join-workspace.ts';
import { WELCOME_TEXT } from './conversation-texts.ts';
import type { ClaimedEvent } from './claimed-event.ts';
import type { InboundHandler } from './inbound-step.ts';
import { recordSenderIdentity } from './record-sender-identity.ts';

export type InboundHandlerDependencies = {
  channel: MessagingChannel;
  clock: Clock;
  database: Database;
  encryptionKey: string;
};

const textPayloadSchema = z.object({ text: z.string() });

export function createInboundHandler(dependencies: InboundHandlerDependencies | null): InboundHandler {
  return async (event, stages) => {
    if (dependencies === null) return { kind: 'not_configured', group: 'zalo' };
    const { channel, clock } = dependencies;
    return stages.finishEvent(async (transaction) => {
      await recordSenderIdentity(transaction, event);
      const inviteCode = readInviteCode(event);
      if (inviteCode !== null) return joinWithInviteCode(transaction, inviteCode);
      await enqueueText(transaction, {
        to: describeSender(event),
        text: WELCOME_TEXT,
        maxTextLength: channel.maxTextLength,
        availableAt: clock.now(),
      });
    });
  };
}

function readInviteCode(event: ClaimedEvent): string | null {
  if (event.kind !== 'text') return null;
  const { text } = textPayloadSchema.parse(event.payload);
  return isInviteCodeMessage(text) ? text : null;
}

function describeSender(event: ClaimedEvent) {
  return { channel: event.channel, accountId: event.accountId, externalUserId: event.externalUserId };
}
