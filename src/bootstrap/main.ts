import { extendEventLocks, handBackEvents } from '../app/processing/hand-back-events.ts';
import { pauseBeforeNextPoll, startQueueWorker } from '../app/processing/queue-worker.ts';
import { assembleService } from './assemble-service.ts';

const TICK_INTERVAL_MS = 60_000;
const INBOUND_CONCURRENCY = 4;
const OUTBOUND_CONCURRENCY = 1;
const SHUTDOWN_WINDOW_MS = 270_000;
const LOCK_MARGIN_MS = 30_000;

const service = assembleService(process.env);
await service.checkDatabaseRole();
const ticker = setInterval(() => void tick(), TICK_INTERVAL_MS);
const inboundWorker = startQueueWorker({
  name: 'inbound',
  runStep: service.runInboundStep,
  concurrency: INBOUND_CONCURRENCY,
  pause: pauseBeforeNextPoll,
});
const outboundWorker = startQueueWorker({
  name: 'outbound',
  runStep: service.runOutboundStep,
  concurrency: OUTBOUND_CONCURRENCY,
  pause: pauseBeforeNextPoll,
});

process.once('SIGTERM', () => void shutDown());

await service.server.listen({ port: service.config.port, host: '0.0.0.0' });

async function tick(): Promise<void> {
  try {
    await service.runTick();
  } catch (error) {
    console.error('[ticker] tick failed:', error instanceof Error ? error.name : 'unknown error');
  }
}

async function shutDown(): Promise<void> {
  const deadline = Date.now() + SHUTDOWN_WINDOW_MS;
  clearInterval(ticker);
  const closingServer = service.server.close();
  const workersIdle = Promise.all([inboundWorker.stop(), outboundWorker.stop()]);
  console.log(`[shutdown] started in_progress=${service.heldEvents.list().length}`);
  await extendHeldLocks(new Date(deadline + LOCK_MARGIN_MS));
  await Promise.race([workersIdle, waitUntil(deadline)]);
  const handedBack = await handBackHeldEvents();
  await Promise.race([closingServer, waitUntil(deadline)]);
  await service.pool.end();
  console.log(`[shutdown] finished handed_back=${handedBack}`);
  process.exit(0);
}

async function extendHeldLocks(lockedUntil: Date): Promise<void> {
  try {
    await extendEventLocks(service.pool, service.heldEvents.list(), lockedUntil);
  } catch (error) {
    console.error('[shutdown] extending locks failed:', error instanceof Error ? error.name : 'unknown error');
  }
}

async function handBackHeldEvents(): Promise<number> {
  try {
    const eventIds = await handBackEvents(service.pool, service.heldEvents.list(), new Date());
    for (const eventId of eventIds) console.log(`[shutdown] handed back event=${eventId}`);
    return eventIds.length;
  } catch (error) {
    console.error('[shutdown] handing back failed:', error instanceof Error ? error.name : 'unknown error');
    return 0;
  }
}

function waitUntil(deadline: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now())).unref());
}
