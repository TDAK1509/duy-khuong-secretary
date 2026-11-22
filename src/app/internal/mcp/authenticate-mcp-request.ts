import { hashSecretToken } from '../admin/secret-token.ts';
import type { Database } from '../../db/transaction.ts';

export type AuthResult =
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden' }
  | { kind: 'authenticated'; userId: string };

const SESSION_QUERY = `
  SELECT session.user_id, users.is_internal
  FROM internal_sessions session
  JOIN users ON users.id = session.user_id
  WHERE session.token_hash = $1 AND session.expires_at > $2`;

const MCP_TOKEN_QUERY = `
  SELECT mcp.user_id FROM internal_mcp_tokens mcp
  JOIN users ON users.id = mcp.user_id
  WHERE mcp.token_hash = $1 AND mcp.expires_at > $2 AND users.is_internal = true`;

export async function authenticateMcpRequest(
  database: Database,
  authorization: string | undefined,
  now: Date,
): Promise<AuthResult> {
  const token = extractBearerToken(authorization);
  if (token === null) return { kind: 'unauthenticated' };
  const sessionResult = await lookUpSession(database, token, now);
  if (sessionResult.kind !== 'unauthenticated') return sessionResult;
  return lookUpMcpToken(database, token, now);
}

function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length);
  return token.length > 0 ? token : null;
}

async function lookUpSession(database: Database, token: string, now: Date): Promise<AuthResult> {
  const { rows } = await database.query<{ user_id: string; is_internal: boolean }>(SESSION_QUERY, [
    hashSecretToken(token),
    now,
  ]);
  const row = rows[0];
  if (row === undefined) return { kind: 'unauthenticated' };
  if (!row.is_internal) return { kind: 'forbidden' };
  return { kind: 'authenticated', userId: row.user_id };
}

async function lookUpMcpToken(database: Database, token: string, now: Date): Promise<AuthResult> {
  const { rows } = await database.query<{ user_id: string }>(MCP_TOKEN_QUERY, [hashSecretToken(token), now]);
  const row = rows[0];
  return row ? { kind: 'authenticated', userId: row.user_id } : { kind: 'unauthenticated' };
}
