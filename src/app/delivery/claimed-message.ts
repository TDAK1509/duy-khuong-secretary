import type { ChannelRecipient } from '../../services/messaging/messaging-channel.ts';

export type MessageContent =
  | { kind: 'text'; body: string }
  | { kind: 'image'; photoKey: string; text?: string }
  | { kind: 'template'; templateId: string; params: Record<string, string> };

export type ClaimedMessage = {
  id: string;
  to: ChannelRecipient;
  content: MessageContent;
  adminMembershipId: string | null;
  scheduledTaskId: string | null;
  requiresOpenWindow: boolean;
  attempts: number;
};

export function mayBeHeld(message: ClaimedMessage): boolean {
  return message.scheduledTaskId !== null || message.requiresOpenWindow;
}
