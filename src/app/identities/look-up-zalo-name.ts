import type { ChannelRecipient, MessagingChannel } from '../../services/messaging/messaging-channel.ts';
import { readAccessKey } from '../channel-auth/read-access-key.ts';
import type { Database } from '../db/transaction.ts';

export type NameLookup = { channel: MessagingChannel; database: Database; encryptionKey: string };

export async function lookUpZaloName(lookup: NameLookup, person: ChannelRecipient): Promise<string | null> {
  const { channel, database, encryptionKey } = lookup;
  const accessKey = await readAccessKey(database, person.channel, person.accountId, encryptionKey);
  return accessKey === null ? null : channel.getDisplayName(person, accessKey);
}
