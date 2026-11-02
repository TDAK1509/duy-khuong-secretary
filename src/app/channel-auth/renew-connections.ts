import type { AuthResult, ChannelAuth, TokenPair } from '../../services/channel-auth/channel-auth.ts';
import type { Clock } from '../../services/clock/clock.ts';
import { describeRenewalFailed, describeRenewalGotNoAnswer } from '../alerts/alert-texts.ts';
import type { OperatorAlerts } from '../alerts/operator-alerts.ts';
import type { Database } from '../db/transaction.ts';
import { decryptToken, encryptToken } from './token-cipher.ts';

const RENEW_WHEN_EXPIRING_WITHIN_MS = 60 * 60 * 1000;

export type RenewalDependencies = {
  database: Database;
  channelAuth: ChannelAuth;
  encryptionKey: string;
  clock: Clock;
  alerts: OperatorAlerts;
  callTimeoutMs: number;
};

type ClaimedConnection = { id: string; account_id: string; refresh_token_encrypted: string };

export async function renewDueConnections(dependencies: RenewalDependencies): Promise<void> {
  await stopInterruptedRenewals(dependencies);
  const due = await dependencies.database.query<{ id: string }>(
    `SELECT id FROM channel_connections
     WHERE status = 'active' AND renewal_started_at IS NULL AND access_expires_at < $1`,
    [renewalDeadline(dependencies.clock.now())],
  );
  for (const { id } of due.rows) {
    await renewConnection(dependencies, id);
  }
}

async function stopInterruptedRenewals(dependencies: RenewalDependencies): Promise<void> {
  const callMayHaveEnded = new Date(dependencies.clock.now().getTime() - dependencies.callTimeoutMs);
  const stopped = await dependencies.database.query<{ account_id: string }>(
    `UPDATE channel_connections SET status = 'reauthorization_required', renewal_started_at = NULL
     WHERE status = 'active' AND renewal_started_at < $1
     RETURNING account_id`,
    [callMayHaveEnded],
  );
  for (const { account_id } of stopped.rows) {
    await dependencies.alerts.raise(describeRenewalGotNoAnswer(account_id));
  }
}

async function renewConnection(dependencies: RenewalDependencies, id: string): Promise<void> {
  const connection = await claimConnection(dependencies, id);
  if (!connection) return;
  const refreshToken = decryptToken(connection.refresh_token_encrypted, dependencies.encryptionKey);
  const result = await dependencies.channelAuth.refresh(refreshToken);
  await settleRenewal(dependencies, connection, result);
}

async function claimConnection(dependencies: RenewalDependencies, id: string): Promise<ClaimedConnection | undefined> {
  const now = dependencies.clock.now();
  const claimed = await dependencies.database.query<ClaimedConnection>(
    `UPDATE channel_connections SET renewal_started_at = $2
     WHERE id = $1 AND status = 'active' AND renewal_started_at IS NULL AND access_expires_at < $3
     RETURNING id, account_id, refresh_token_encrypted`,
    [id, now, renewalDeadline(now)],
  );
  return claimed.rows[0];
}

async function settleRenewal(
  dependencies: RenewalDependencies,
  connection: ClaimedConnection,
  result: AuthResult,
): Promise<void> {
  if (result.ok) return storeRenewedTokens(dependencies, connection.id, result.tokens);
  if (result.reason === 'no_answer') {
    await dependencies.database.query(
      `UPDATE channel_connections SET status = 'reauthorization_required', renewal_started_at = NULL WHERE id = $1`,
      [connection.id],
    );
    return dependencies.alerts.raise(describeRenewalGotNoAnswer(connection.account_id));
  }
  await dependencies.database.query('UPDATE channel_connections SET renewal_started_at = NULL WHERE id = $1', [
    connection.id,
  ]);
  return dependencies.alerts.raise(describeRenewalFailed(connection.account_id, result.reason));
}

async function storeRenewedTokens(
  { database, clock, encryptionKey }: RenewalDependencies,
  id: string,
  tokens: TokenPair,
): Promise<void> {
  await database.query(
    `UPDATE channel_connections SET
       access_token_encrypted = $2, refresh_token_encrypted = $3,
       access_expires_at = $4, refresh_expires_at = $5, refreshed_at = $6, renewal_started_at = NULL
     WHERE id = $1`,
    [
      id,
      encryptToken(tokens.accessToken, encryptionKey),
      encryptToken(tokens.refreshToken, encryptionKey),
      tokens.accessExpiresAt,
      tokens.refreshExpiresAt,
      clock.now(),
    ],
  );
}

function renewalDeadline(now: Date): Date {
  return new Date(now.getTime() + RENEW_WHEN_EXPIRING_WITHIN_MS);
}
