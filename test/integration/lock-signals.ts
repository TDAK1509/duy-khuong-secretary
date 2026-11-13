import { setTimeout } from 'node:timers/promises';
import type { TemporaryDatabase } from './temporary-database.ts';

const LOCK_WAIT_LIMIT_MS = 2000;
const LOCK_WAIT_STEP_MS = 20;

export type Signal = { promise: Promise<void>; send: () => void };

export function makeSignal(): Signal {
  let send: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    send = resolve;
  });
  return { promise, send };
}

export async function waitUntilATransactionWaitsForALock(database: TemporaryDatabase): Promise<void> {
  const giveUpAt = Date.now() + LOCK_WAIT_LIMIT_MS;
  while (Date.now() < giveUpAt) {
    const [row] = await database.query<{ waiting: number }>(
      `SELECT count(*)::int AS waiting FROM pg_locks lock JOIN pg_stat_activity session ON session.pid = lock.pid
       WHERE NOT lock.granted AND session.datname = current_database()`,
    );
    if (row && row.waiting > 0) return;
    await setTimeout(LOCK_WAIT_STEP_MS);
  }
  throw new Error('no transaction ever waited for a lock');
}
