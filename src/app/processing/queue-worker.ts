import { setTimeout as sleep } from 'node:timers/promises';

const POLL_INTERVAL_MS = 1000;

export type QueueWorkerOptions = {
  name: string;
  runStep: () => Promise<'processed' | 'idle'>;
  concurrency: number;
  pause: (signal: AbortSignal) => Promise<void>;
};

export type QueueWorker = { stop(): Promise<void> };

export function startQueueWorker(options: QueueWorkerOptions): QueueWorker {
  const stopSignal = new AbortController();
  const lanes = Array.from({ length: options.concurrency }, () => runLane(options, stopSignal.signal));
  return {
    stop: async () => {
      stopSignal.abort();
      await Promise.all(lanes);
    },
  };
}

export function pauseBeforeNextPoll(signal: AbortSignal): Promise<void> {
  return sleep(POLL_INTERVAL_MS, undefined, { signal }).catch(() => undefined);
}

async function runLane(options: QueueWorkerOptions, stopSignal: AbortSignal): Promise<void> {
  while (!stopSignal.aborted) {
    if ((await runStepSafely(options)) !== 'processed') await options.pause(stopSignal);
  }
}

async function runStepSafely(options: QueueWorkerOptions): Promise<'processed' | 'idle' | 'failed'> {
  try {
    return await options.runStep();
  } catch (error) {
    console.error(`[${options.name}] step failed:`, error instanceof Error ? error.name : 'unknown error');
    return 'failed';
  }
}
