import type { Transaction } from '../db/transaction.ts';
import type { ChannelIdentity } from './channel-identity.ts';

export async function setCurrentWorkspace(
  transaction: Transaction,
  identity: ChannelIdentity,
  workspaceId: string,
): Promise<void> {
  await transaction.query('UPDATE channel_identities SET current_workspace_id = $2 WHERE id = $1', [
    identity.id,
    workspaceId,
  ]);
}
