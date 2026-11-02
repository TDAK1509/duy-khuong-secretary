import { z } from 'zod';
import type { Clock } from '../../services/clock/clock.ts';
import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import type { Database, Transaction } from '../db/transaction.ts';
import type { ChannelIdentity } from '../identities/channel-identity.ts';
import { isInviteCodeMessage } from '../workspaces/invite-code.ts';
import { joinWithInviteCode } from '../workspaces/join-workspace.ts';
import { formatJoinedText, WELCOME_TEXT } from './conversation-texts.ts';
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
      const identity = await recordSenderIdentity(transaction, event);
      const reply = await decideReply(transaction, { identity, event, now: clock.now() });
      if (reply === null) return;
      await enqueueText(transaction, {
        to: describeSender(event),
        text: reply,
        maxTextLength: channel.maxTextLength,
        availableAt: clock.now(),
      });
    });
  };
}

type Message = { identity: ChannelIdentity; event: ClaimedEvent; now: Date };

async function decideReply(transaction: Transaction, { identity, event, now }: Message): Promise<string | null> {
  const inviteCode = readInviteCode(event);
  if (inviteCode === null) return WELCOME_TEXT;
  const joined = await joinWithInviteCode(transaction, { identity, code: inviteCode, now });
  return joined && formatJoinedText(joined);
}

function readInviteCode(event: ClaimedEvent): string | null {
  if (event.kind !== 'text') return null;
  const { text } = textPayloadSchema.parse(event.payload);
  return isInviteCodeMessage(text) ? text : null;
}

function describeSender(event: ClaimedEvent) {
  return { channel: event.channel, accountId: event.accountId, externalUserId: event.externalUserId };
}
