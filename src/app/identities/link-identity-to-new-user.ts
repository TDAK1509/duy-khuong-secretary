import type { Transaction } from '../db/transaction.ts';
import type { ChannelIdentity } from './channel-identity.ts';

export async function linkIdentityToNewUser(transaction: Transaction, identity: ChannelIdentity): Promise<string> {
  const [user] = await transaction.query<{ id: string }>('INSERT INTO users DEFAULT VALUES RETURNING id');
  const userId = user?.id ?? '';
  await transaction.query('UPDATE channel_identities SET user_id = $2 WHERE id = $1', [identity.id, userId]);
  return userId;
}
