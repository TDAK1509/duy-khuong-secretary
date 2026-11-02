import type { ChannelAuth, TokenPair } from '../../services/channel-auth/channel-auth.ts';
import type { Clock } from '../../services/clock/clock.ts';
import { describeRenewalFailed } from '../alerts/alert-texts.ts';
import type { OperatorAlerts } from '../alerts/operator-alerts.ts';
import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { decryptToken, encryptToken } from './token-cipher.ts';

const RENEW_WHEN_EXPIRING_WITHIN_MS = 60 * 60 * 1000;

export type RenewalDependencies = {
  database: Database;
  channelAuth: ChannelAuth;
  encryptionKey: string;
  clock: Clock;
  alerts: OperatorAlerts;
};

type DueConnection = { id: string; account_id: string; refresh_token_encrypted: string };

type RenewalOutcome =
  | { kind: 'skipped' }
  | { kind: 'renewed' }
  | { kind: 'failed'; accountId: string; reason: string }
  | { kind: 'no_answer'; accountId: string };

export async function renewDueConnections(dependencies: RenewalDependencies): Promise<void> {
  const due = await dependencies.database.query<{ id: string }>(
    `SELECT id FROM channel_connections WHERE status = 'active' AND access_expires_at < $1`,
    [renewalDeadline(dependencies.clock.now())],
  );
  for (const { id } of due.rows) {
    await renewConnection(dependencies, id);
  }
}

function renewalDeadline(now: Date): Date {
  return new Date(now.getTime() + RENEW_WHEN_EXPIRING_WITHIN_MS);
}

async function renewConnection(dependencies: RenewalDependencies, id: string): Promise<void> {
  const outcome = await renewInTransaction(dependencies, id);
  if (outcome.kind === 'failed') {
    await dependencies.alerts.raise(describeRenewalFailed(outcome.accountId, outcome.reason));
  }
}

async function renewInTransaction(dependencies: RenewalDependencies, id: string): Promise<RenewalOutcome> {
  const now = dependencies.clock.now();
  return runInTransaction(dependencies.database, async (transaction) => {
    const [connection] = await transaction.query<DueConnection>(
      `SELECT id, account_id, refresh_token_encrypted FROM channel_connections
       WHERE id = $1 AND status = 'active' AND access_expires_at < $2
       FOR UPDATE SKIP LOCKED`,
      [id, renewalDeadline(now)],
    );
    if (!connection) return { kind: 'skipped' };
    const refreshToken = decryptToken(connection.refresh_token_encrypted, dependencies.encryptionKey);
    const result = await dependencies.channelAuth.refresh(refreshToken);
    if (!result.ok && result.reason === 'no_answer') {
      await requireReauthorization(transaction, connection.id);
      return { kind: 'no_answer', accountId: connection.account_id };
    }
    if (!result.ok) return { kind: 'failed', accountId: connection.account_id, reason: result.reason };
    await storeRenewedTokens(transaction, connection.id, result.tokens, now, dependencies.encryptionKey);
    return { kind: 'renewed' };
  });
}

async function requireReauthorization(transaction: Transaction, id: string): Promise<void> {
  await transaction.query(`UPDATE channel_connections SET status = 'reauthorization_required' WHERE id = $1`, [id]);
}

async function storeRenewedTokens(
  transaction: Transaction,
  id: string,
  tokens: TokenPair,
  refreshedAt: Date,
  encryptionKey: string,
): Promise<void> {
  await transaction.query(
    `UPDATE channel_connections SET
       access_token_encrypted = $2, refresh_token_encrypted = $3,
       access_expires_at = $4, refresh_expires_at = $5, refreshed_at = $6
     WHERE id = $1`,
    [
      id,
      encryptToken(tokens.accessToken, encryptionKey),
      encryptToken(tokens.refreshToken, encryptionKey),
      tokens.accessExpiresAt,
      tokens.refreshExpiresAt,
      refreshedAt,
    ],
  );
}
