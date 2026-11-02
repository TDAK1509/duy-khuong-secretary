import { setTimeout as sleep } from 'node:timers/promises';

const POLL_INTERVAL_MS = 1000;

export type InboundWorkerOptions = {
  runStep: () => Promise<'processed' | 'idle'>;
  concurrency: number;
  pause: (signal: AbortSignal) => Promise<void>;
};

export type InboundWorker = { stop(): Promise<void> };

export function startInboundWorker(options: InboundWorkerOptions): InboundWorker {
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

async function runLane(options: InboundWorkerOptions, stopSignal: AbortSignal): Promise<void> {
  while (!stopSignal.aborted) {
    if ((await runStepSafely(options.runStep)) !== 'processed') await options.pause(stopSignal);
  }
}

async function runStepSafely(runStep: InboundWorkerOptions['runStep']): Promise<'processed' | 'idle' | 'failed'> {
  try {
    return await runStep();
  } catch (error) {
    console.error('[inbound] step failed:', error instanceof Error ? error.name : 'unknown error');
    return 'failed';
  }
}
