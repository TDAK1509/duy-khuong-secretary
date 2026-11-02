import type { ChannelRecipient } from '../../services/messaging/messaging-channel.ts';

export type ClaimedMessage = {
  id: string;
  to: ChannelRecipient;
  body: string;
  adminMembershipId: string | null;
  attempts: number;
};
