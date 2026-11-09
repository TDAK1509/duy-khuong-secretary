import type { PendingChoice } from '../identities/pending-choice.ts';

export type Reply = { text: string; offeredChoice?: PendingChoice; adminMembershipId?: string; followUpText?: string; followUpChoice?: PendingChoice };
