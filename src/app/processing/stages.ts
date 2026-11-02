import type { Clock } from '../../services/clock/clock.ts';
import { scopeDatabase } from '../db/scoped-database.ts';
import type { Database, DatabaseScope, Transaction } from '../db/transaction.ts';
import { runInClaimedTransaction } from './claimed-transaction.ts';
import type { ClaimedEvent } from './claimed-event.ts';

export type Finished = { kind: 'finished' };

export type NotConfigured = { kind: 'not_configured'; group: string };

export type Stage = {
  isDone(transaction: Transaction): Promise<boolean>;
  write(transaction: Transaction): Promise<void>;
};

export type Stages = {
  runStage(stage: Stage): Promise<void>;
  finishEvent(write: (transaction: Transaction) => Promise<void>): Promise<Finished>;
  forScope(scope: DatabaseScope): Stages;
};

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
    forScope: (scope) => createStages(scopeDatabase(database, scope), event, clock),
  };
}
