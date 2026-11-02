import type { ChannelRecipient } from '../../services/messaging/messaging-channel.ts';

export type MessageContent = { kind: 'text'; body: string } | { kind: 'image'; photoKey: string };

export type ClaimedMessage = {
  id: string;
  to: ChannelRecipient;
  content: MessageContent;
  adminMembershipId: string | null;
  attempts: number;
};
