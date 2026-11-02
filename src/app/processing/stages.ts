import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import type { ClaimedEvent } from './claimed-event.ts';

export type Finished = { kind: 'finished' };

export type Stages = {
  finishEvent(write: (transaction: Transaction) => Promise<void>): Promise<Finished>;
};

export function createStages(database: Database, event: ClaimedEvent, now: Date): Stages {
  return {
    finishEvent: (write) =>
      runInTransaction(database, async (transaction) => {
        await write(transaction);
        await transaction.query(
          `UPDATE inbound_events SET status = 'done', processed_at = $2, locked_until = NULL WHERE id = $1`,
          [event.id, now],
        );
        return { kind: 'finished' };
      }),
  };
}
