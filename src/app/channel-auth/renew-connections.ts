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

type ClaimedConnection = { id: string; account_id: string; refresh_token_encrypted: string; claimedAt: Date };

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
  const claimedAt = dependencies.clock.now();
  const claimed = await dependencies.database.query<Omit<ClaimedConnection, 'claimedAt'>>(
    `UPDATE channel_connections SET renewal_started_at = $2
     WHERE id = $1 AND status = 'active' AND renewal_started_at IS NULL AND access_expires_at < $3
     RETURNING id, account_id, refresh_token_encrypted`,
    [id, claimedAt, renewalDeadline(claimedAt)],
  );
  const [row] = claimed.rows;
  return row && { ...row, claimedAt };
}

async function settleRenewal(
  dependencies: RenewalDependencies,
  connection: ClaimedConnection,
  result: AuthResult,
): Promise<void> {
  if (result.ok) return storeRenewedTokens(dependencies, connection, result.tokens);
  if (result.reason === 'no_answer') {
    const isSettled = await settleClaim(dependencies, connection, [`status = 'reauthorization_required'`]);
    if (isSettled) await dependencies.alerts.raise(describeRenewalGotNoAnswer(connection.account_id));
    return;
  }
  const isSettled = await settleClaim(dependencies, connection, []);
  if (isSettled) await dependencies.alerts.raise(describeRenewalFailed(connection.account_id, result.reason));
}

async function storeRenewedTokens(
  dependencies: RenewalDependencies,
  connection: ClaimedConnection,
  tokens: TokenPair,
): Promise<void> {
  const { clock, encryptionKey } = dependencies;
  await settleClaim(
    dependencies,
    connection,
    [
      'access_token_encrypted = $3',
      'refresh_token_encrypted = $4',
      'access_expires_at = $5',
      'refresh_expires_at = $6',
      'refreshed_at = $7',
    ],
    [
      encryptToken(tokens.accessToken, encryptionKey),
      encryptToken(tokens.refreshToken, encryptionKey),
      tokens.accessExpiresAt,
      tokens.refreshExpiresAt,
      clock.now(),
    ],
  );
}

async function settleClaim(
  { database }: RenewalDependencies,
  connection: ClaimedConnection,
  assignments: string[],
  values: unknown[] = [],
): Promise<boolean> {
  const settled = await database.query(
    `UPDATE channel_connections SET ${[...assignments, 'renewal_started_at = NULL'].join(', ')}
     WHERE id = $1 AND renewal_started_at = $2`,
    [connection.id, connection.claimedAt, ...values],
  );
  if (settled.rowCount === 0) {
    console.error(`[renewal] ignored a result for OA ${connection.account_id}: the connection changed during the call`);
  }
  return settled.rowCount !== 0;
}

function renewalDeadline(now: Date): Date {
  return new Date(now.getTime() + RENEW_WHEN_EXPIRING_WITHIN_MS);
}
