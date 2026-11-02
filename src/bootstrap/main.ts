import { assembleService } from './assemble-service.ts';

const TICK_INTERVAL_MS = 60_000;

const service = assembleService(process.env);
const ticker = setInterval(() => void tick(), TICK_INTERVAL_MS);

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
  await service.server.close();
  await service.pool.end();
}
