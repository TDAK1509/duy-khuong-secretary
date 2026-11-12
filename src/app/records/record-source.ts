export type RecordSource = {
  messageId: string;
  recordIds: string[];
  sender: string;
  isOwn: boolean;
  sentAt: Date;
  kind: 'photo' | 'text';
  paperDates: string[];
  text: string | null;
};
