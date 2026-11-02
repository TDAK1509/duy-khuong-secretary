import type { Clock } from '../../services/clock/clock.ts';
import type { OperatorAlerts } from '../alerts/operator-alerts.ts';
import type { Database } from '../db/transaction.ts';
import { ClaimLostError } from './claimed-transaction.ts';
import { claimInboundEvent } from './claim-inbound-event.ts';
import type { ClaimedEvent } from './claimed-event.ts';
import type { OffGroupNotices } from './off-group-notices.ts';
import { postponeEvent } from './postpone-event.ts';
import { failExhaustedEvent, MAX_ATTEMPTS, recordFailure } from './record-failure.ts';
import { createStages, type Finished, type NotConfigured, type Stages } from './stages.ts';

export type InboundHandler = (event: ClaimedEvent, stages: Stages) => Promise<Finished | NotConfigured>;

export type InboundDependencies = {
  database: Database;
  clock: Clock;
  alerts: OperatorAlerts;
  notices: OffGroupNotices;
  handler: InboundHandler;
};

export async function runInboundStep(dependencies: InboundDependencies): Promise<'processed' | 'idle'> {
  const { database, clock } = dependencies;
  const event = await claimInboundEvent(database, clock.now());
  if (!event) return 'idle';
  try {
    await handleClaimedEvent(dependencies, event);
  } catch (error) {
    if (!(error instanceof ClaimLostError)) throw error;
    console.error('[inbound] claim lost; the new owner finishes the event:', event.id);
  }
  return 'processed';
}

async function handleClaimedEvent(dependencies: InboundDependencies, event: ClaimedEvent): Promise<void> {
  const { database, clock, handler } = dependencies;
  if (event.attempts > MAX_ATTEMPTS) return failExhaustedEvent(dependencies, event);
  try {
    const result = await handler(event, createStages(database, event, clock));
    if (result.kind === 'not_configured') await postponeEvent(dependencies, event, result.group);
  } catch (error) {
    await recordFailure(dependencies, event, clock.now(), error);
  }
}
