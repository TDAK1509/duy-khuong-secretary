import { z } from 'zod';
import type { ChatService } from '../../services/chat/chat-service.ts';
import type { Clock } from '../../services/clock/clock.ts';
import type { MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import type { ReaderService } from '../../services/reading/reader-service.ts';
import type { PhotoStorage } from '../../services/storage/photo-storage.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import { releaseHeldMessages } from '../delivery/release-held-messages.ts';
import type { Reply } from '../delivery/reply.ts';
import type { Database, Transaction } from '../db/transaction.ts';
import { clearChoiceUnlessAnswered } from '../identities/clear-pending-choice.ts';
import type { ChannelIdentity } from '../identities/channel-identity.ts';
import { lookUpZaloName } from '../identities/look-up-zalo-name.ts';
import { findIntakeSender } from '../intake/find-intake-sender.ts';
import { receiveIntake } from '../intake/receive-intake.ts';
import { hasUsableInvite } from '../workspaces/has-usable-invite.ts';
import { isInviteCodeMessage } from '../workspaces/invite-code.ts';
import { joinWithInviteCode } from '../workspaces/join-workspace.ts';
import { findPersonWorkspace } from '../workspaces/find-person-workspace.ts';
import {
  formatInviterNotice,
  formatJoinResult,
  NO_LONGER_IN_A_WORKSPACE_TEXT,
  WELCOME_TEXT,
  type JoinedPerson,
} from './conversation-texts.ts';
import type { ClaimedEvent } from './claimed-event.ts';
import type { InboundHandler } from './inbound-step.ts';
import type { Stage } from './stages.ts';
import { recordSenderIdentity } from './record-sender-identity.ts';
import { replyToMember } from './reply-to-member.ts';

export type InboundHandlerDependencies = {
  channel: MessagingChannel;
  clock: Clock;
  database: Database;
  encryptionKey: string;
  photoStorage: PhotoStorage | null;
  reader: ReaderService | null;
  chat: ChatService | null;
};

const textPayloadSchema = z.object({ text: z.string() });

export function createInboundHandler(dependencies: InboundHandlerDependencies | null): InboundHandler {
  return async (event, stages) => {
    if (dependencies === null) return { kind: 'not_configured', group: 'zalo' };
    await stages.runStage(releaseHeldStage(dependencies, event));
    const text = readText(event);
    const sender = await findIntakeSender(dependencies.database, event, text);
    if (sender !== null) return receiveIntake(dependencies, stages, event, sender);
    const inviteCode = text !== null && isInviteCodeMessage(text) ? text : null;
    const zaloName = await lookUpNameOfNewMember(dependencies, event, inviteCode);
    return stages.finishEvent((transaction) =>
      answerSender(transaction, dependencies, { event, text, inviteCode, zaloName }),
    );
  };
}

function releaseHeldStage({ channel, clock }: InboundHandlerDependencies, event: ClaimedEvent): Stage {
  const to = describeSender(event);
  return {
    isDone: async () => false,
    write: async (transaction) => {
      await recordSenderIdentity(transaction, event);
      await releaseHeldMessages(transaction, { to, maxTextLength: channel.maxTextLength, now: clock.now() });
    },
  };
}

function readText(event: ClaimedEvent): string | null {
  if (event.kind !== 'text') return null;
  return textPayloadSchema.parse(event.payload).text;
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

type Message = { event: ClaimedEvent; text: string | null; inviteCode: string | null; zaloName: string | null };

async function answerSender(
  transaction: Transaction,
  { channel, clock }: InboundHandlerDependencies,
  message: Message,
): Promise<void> {
  const now = clock.now();
  const identity = await recordSenderIdentity(transaction, message.event);
  await clearChoiceUnlessAnswered(transaction, identity, message.text);
  const reply = await decideReply(transaction, { ...message, identity, now, maxTextLength: channel.maxTextLength });
  if (reply === null) return;
  await enqueueReply(transaction, { ...message, now, maxTextLength: channel.maxTextLength }, reply);
}

async function enqueueReply(transaction: Transaction, message: Pick<ReceivedMessage, 'event' | 'now' | 'maxTextLength'>, reply: Reply): Promise<void> {
  const common = {
    to: describeSender(message.event),
    maxTextLength: message.maxTextLength,
    availableAt: message.now,
    ...(reply.adminMembershipId !== undefined && { adminMembershipId: reply.adminMembershipId }),
  };
  await enqueueText(transaction, {
    ...common,
    text: reply.text,
    ...(reply.offeredChoice && { offeredChoice: { choice: reply.offeredChoice, sourceEventId: message.event.id } }),
  });
  if (reply.followUpText !== undefined) await enqueueText(transaction, { ...common, text: reply.followUpText });
}

type ReceivedMessage = Message & { identity: ChannelIdentity; now: Date; maxTextLength: number };

async function decideReply(transaction: Transaction, message: ReceivedMessage): Promise<Reply | null> {
  const { identity, inviteCode, zaloName, now } = message;
  if (inviteCode === null) return replyToOtherMessage(transaction, message);
  const joined = await joinWithInviteCode(transaction, { identity, code: inviteCode, zaloName, now });
  if (joined.kind === 'joined') await tellInviter(transaction, joined, message);
  return { text: formatJoinResult(joined) };
}

async function tellInviter(transaction: Transaction, joined: JoinedPerson, message: ReceivedMessage): Promise<void> {
  if (joined.inviter === null) return;
  await enqueueText(transaction, {
    to: joined.inviter.recipient,
    text: formatInviterNotice(joined, message.zaloName),
    maxTextLength: message.maxTextLength,
    availableAt: message.now,
    adminMembershipId: joined.inviter.membershipId,
  });
}

async function replyToOtherMessage(transaction: Transaction, { identity, text, now }: ReceivedMessage): Promise<Reply | null> {
  if (identity.userId === null) return { text: WELCOME_TEXT };
  const workspaceId = await findPersonWorkspace(transaction, identity);
  if (workspaceId === null) return { text: NO_LONGER_IN_A_WORKSPACE_TEXT };
  return replyToMember(transaction, { identity, userId: identity.userId, workspaceId, text, now });
}
