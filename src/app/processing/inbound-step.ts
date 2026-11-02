import type { Clock } from '../../services/clock/clock.ts';
import type { Database } from '../db/transaction.ts';
import { claimInboundEvent } from './claim-inbound-event.ts';
import type { ClaimedEvent } from './claimed-event.ts';
import { recordFailure } from './record-failure.ts';
import { createStages, type Finished, type Stages } from './stages.ts';

export type InboundHandler = (event: ClaimedEvent, stages: Stages) => Promise<Finished>;

export type InboundDependencies = {
  database: Database;
  clock: Clock;
  handler: InboundHandler;
};

export async function runInboundStep(dependencies: InboundDependencies): Promise<'processed' | 'idle'> {
  const { database, clock, handler } = dependencies;
  const event = await claimInboundEvent(database);
  if (!event) return 'idle';
  try {
    await handler(event, createStages(database, event, clock.now()));
  } catch (error) {
    await recordFailure(database, event, clock.now(), error);
  }
  return 'processed';
}
