import type { Clock } from '../../services/clock/clock.ts';
import type { OperatorAlerts } from '../alerts/operator-alerts.ts';
import type { Database } from '../db/transaction.ts';
import { claimInboundEvent } from './claim-inbound-event.ts';
import type { ClaimedEvent } from './claimed-event.ts';
import { postponeEvent } from './postpone-event.ts';
import { recordFailure } from './record-failure.ts';
import { createStages, type Finished, type NotConfigured, type Stages } from './stages.ts';

export type InboundHandler = (event: ClaimedEvent, stages: Stages) => Promise<Finished | NotConfigured>;

export type InboundDependencies = {
  database: Database;
  clock: Clock;
  alerts: OperatorAlerts;
  handler: InboundHandler;
};

export async function runInboundStep(dependencies: InboundDependencies): Promise<'processed' | 'idle'> {
  const { database, clock, handler } = dependencies;
  const event = await claimInboundEvent(database, clock.now());
  if (!event) return 'idle';
  try {
    const result = await handler(event, createStages(database, event, clock));
    if (result.kind === 'not_configured') await postponeEvent(database, event, clock.now());
  } catch (error) {
    await recordFailure(dependencies, event, clock.now(), error);
  }
  return 'processed';
}
