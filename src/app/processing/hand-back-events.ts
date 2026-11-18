import type { Database } from '../db/transaction.ts';
import type { HeldEvent } from './held-events.ts';

const EXTEND_LOCKS_SQL = `
  UPDATE inbound_events SET locked_until = $3
  FROM unnest($1::uuid[], $2::uuid[]) AS held(id, claim_token)
  WHERE inbound_events.id = held.id AND inbound_events.claim_token = held.claim_token AND inbound_events.status = 'processing'`;

const HAND_BACK_SQL = `
  UPDATE inbound_events
  SET status = 'queued', available_at = $3, locked_until = NULL, claim_token = NULL, attempts = attempts - 1, last_error = 'shutdown'
  FROM unnest($1::uuid[], $2::uuid[]) AS held(id, claim_token)
  WHERE inbound_events.id = held.id AND inbound_events.claim_token = held.claim_token AND inbound_events.status = 'processing'
  RETURNING inbound_events.id`;

export async function extendEventLocks(database: Database, events: HeldEvent[], lockedUntil: Date): Promise<void> {
  if (events.length === 0) return;
  await database.query(EXTEND_LOCKS_SQL, [...splitHeldEvents(events), lockedUntil]);
}

export async function handBackEvents(database: Database, events: HeldEvent[], now: Date): Promise<string[]> {
  if (events.length === 0) return [];
  const { rows } = await database.query<{ id: string }>(HAND_BACK_SQL, [...splitHeldEvents(events), now]);
  return rows.map((row) => row.id);
}

function splitHeldEvents(events: HeldEvent[]): [string[], string[]] {
  return [events.map((event) => event.id), events.map((event) => event.claimToken)];
}
