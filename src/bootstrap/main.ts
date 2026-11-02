import { pauseBeforeNextPoll, startQueueWorker } from '../app/processing/queue-worker.ts';
import { assembleService } from './assemble-service.ts';

const TICK_INTERVAL_MS = 60_000;
const INBOUND_CONCURRENCY = 4;
const OUTBOUND_CONCURRENCY = 1;
const SHUTDOWN_WAIT_MS = 25_000;

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
  clearInterval(ticker);
  await Promise.race([Promise.all([inboundWorker.stop(), outboundWorker.stop()]), waitFor(SHUTDOWN_WAIT_MS)]);
  await service.server.close();
  await service.pool.end();
}

function waitFor(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds).unref());
}
