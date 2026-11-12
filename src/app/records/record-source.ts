export type SourceEvent = {
  channel: string;
  accountId: string;
  externalUserId: string;
  externalEventId: string;
  photoCount: number | null;
};

export type RecordSource = {
  messageId: string;
  recordIds: string[];
  sender: string;
  isOwn: boolean;
  sentAt: Date;
  kind: 'photo' | 'text';
  imageKey: string | null;
  event: SourceEvent | null;
  paperDates: string[];
  text: string | null;
};
