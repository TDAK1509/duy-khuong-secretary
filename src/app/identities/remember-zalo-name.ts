import type { Transaction } from '../db/transaction.ts';
import type { ChannelIdentity } from './channel-identity.ts';

export async function rememberZaloName(
  transaction: Transaction,
  identity: ChannelIdentity,
  zaloName: string | null,
): Promise<void> {
  await transaction.query('UPDATE channel_identities SET zalo_name = COALESCE($2, zalo_name) WHERE id = $1', [
    identity.id,
    zaloName,
  ]);
}
