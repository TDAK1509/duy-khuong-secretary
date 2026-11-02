import { z } from 'zod';
import type { Clock } from '../../services/clock/clock.ts';
import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import type { Database, Transaction } from '../db/transaction.ts';
import type { ChannelIdentity } from '../identities/channel-identity.ts';
import { lookUpZaloName } from '../identities/look-up-zalo-name.ts';
import { hasUsableInvite } from '../workspaces/has-usable-invite.ts';
import { isInviteCodeMessage } from '../workspaces/invite-code.ts';
import { joinWithInviteCode } from '../workspaces/join-workspace.ts';
import { findPersonWorkspace } from '../workspaces/find-person-workspace.ts';
import { formatJoinResult, NO_LONGER_IN_A_WORKSPACE_TEXT, WELCOME_TEXT } from './conversation-texts.ts';
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
    const inviteCode = readInviteCode(event);
    const zaloName = await lookUpNameOfNewMember(dependencies, event, inviteCode);
    return stages.finishEvent((transaction) =>
      answerSender(transaction, dependencies, { event, inviteCode, zaloName }),
    );
  };
}

function readInviteCode(event: ClaimedEvent): string | null {
  if (event.kind !== 'text') return null;
  const { text } = textPayloadSchema.parse(event.payload);
  return isInviteCodeMessage(text) ? text : null;
}

async function lookUpNameOfNewMember(
  dependencies: InboundHandlerDependencies,
  event: ClaimedEvent,
  inviteCode: string | null,
): Promise<string | null> {
  if (inviteCode === null) return null;
  if (!(await hasUsableInvite(dependencies.database, inviteCode, dependencies.clock.now()))) return null;
  return lookUpZaloName(dependencies, describeSender(event));
}

function describeSender(event: ClaimedEvent) {
  return { channel: event.channel, accountId: event.accountId, externalUserId: event.externalUserId };
}

type Message = { event: ClaimedEvent; inviteCode: string | null; zaloName: string | null };

async function answerSender(
  transaction: Transaction,
  { channel, clock }: InboundHandlerDependencies,
  message: Message,
): Promise<void> {
  const now = clock.now();
  const identity = await recordSenderIdentity(transaction, message.event);
  const reply = await decideReply(transaction, { ...message, identity, now });
  if (reply === null) return;
  await enqueueText(transaction, {
    to: describeSender(message.event),
    text: reply,
    maxTextLength: channel.maxTextLength,
    availableAt: now,
  });
}

type ReceivedMessage = Message & { identity: ChannelIdentity; now: Date };

async function decideReply(transaction: Transaction, message: ReceivedMessage): Promise<string | null> {
  const { identity, inviteCode, zaloName, now } = message;
  if (inviteCode === null) return replyToOtherMessage(transaction, identity);
  const joined = await joinWithInviteCode(transaction, { identity, code: inviteCode, zaloName, now });
  return formatJoinResult(joined);
}

async function replyToOtherMessage(transaction: Transaction, identity: ChannelIdentity): Promise<string | null> {
  if (identity.userId === null) return WELCOME_TEXT;
  const workspaceId = await findPersonWorkspace(transaction, identity);
  return workspaceId === null ? NO_LONGER_IN_A_WORKSPACE_TEXT : null;
}
