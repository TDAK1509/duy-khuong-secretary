import type { PendingChoice } from './pending-choice.ts';

export type ChannelIdentity = {
  id: string;
  userId: string | null;
  currentWorkspaceId: string | null;
  pendingChoice: PendingChoice | null;
};
