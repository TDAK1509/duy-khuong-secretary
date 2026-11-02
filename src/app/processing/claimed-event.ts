export type ClaimedEvent = {
  id: string;
  channel: string;
  accountId: string;
  externalUserId: string;
  kind: 'text' | 'images';
  payload: Record<string, unknown>;
  attempts: number;
};
