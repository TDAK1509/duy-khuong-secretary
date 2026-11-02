import type { Clock } from '../../services/clock/clock.ts';
import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import { WELCOME_TEXT } from './conversation-texts.ts';
import type { ClaimedEvent } from './claimed-event.ts';
import type { InboundHandler } from './inbound-step.ts';
import { recordSenderIdentity } from './record-sender-identity.ts';

export function createInboundHandler(channel: MessagingChannel | null, clock: Clock): InboundHandler {
  return async (event, stages) => {
    if (channel === null) return { kind: 'not_configured', group: 'zalo' };
    return stages.finishEvent(async (transaction) => {
      await recordSenderIdentity(transaction, event);
      await enqueueText(transaction, {
        to: describeSender(event),
        text: WELCOME_TEXT,
        maxTextLength: channel.maxTextLength,
        availableAt: clock.now(),
      });
    });
  };
}

function describeSender(event: ClaimedEvent) {
  return { channel: event.channel, accountId: event.accountId, externalUserId: event.externalUserId };
}
