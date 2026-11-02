import type { Clock } from '../../services/clock/clock.ts';
import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import type { ClaimedEvent } from './claimed-event.ts';

export type Finished = { kind: 'finished' };

export type Stage = {
  isDone(transaction: Transaction): Promise<boolean>;
  write(transaction: Transaction): Promise<void>;
};

export type Stages = {
  runStage(stage: Stage): Promise<void>;
  finishEvent(write: (transaction: Transaction) => Promise<void>): Promise<Finished>;
};

export class ClaimLostError extends Error {
  override name = 'ClaimLostError';
}

export function createStages(database: Database, event: ClaimedEvent, clock: Clock): Stages {
  return {
    runStage: (stage) =>
      runInClaimedTransaction(database, event, async (transaction) => {
        if (!(await stage.isDone(transaction))) await stage.write(transaction);
      }),
    finishEvent: (write) =>
      runInClaimedTransaction(database, event, async (transaction) => {
        await write(transaction);
        await transaction.query(
          `UPDATE inbound_events SET status = 'done', processed_at = $2, locked_until = NULL WHERE id = $1`,
          [event.id, clock.now()],
        );
        return { kind: 'finished' };
      }),
  };
}

function runInClaimedTransaction<Result>(
  database: Database,
  event: ClaimedEvent,
  work: (transaction: Transaction) => Promise<Result>,
): Promise<Result> {
  return runInTransaction(database, async (transaction) => {
    await holdClaim(transaction, event);
    return work(transaction);
  });
}

async function holdClaim(transaction: Transaction, event: ClaimedEvent): Promise<void> {
  const rows = await transaction.query(
    `SELECT 1 FROM inbound_events WHERE id = $1 AND status = 'processing' AND attempts = $2 FOR UPDATE`,
    [event.id, event.attempts],
  );
  if (rows.length === 0) throw new ClaimLostError(`the claim on event ${event.id} was lost`);
}
