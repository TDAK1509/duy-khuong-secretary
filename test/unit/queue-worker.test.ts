import { describe, expect, it } from 'vitest';
import { startQueueWorker } from '../../src/app/processing/queue-worker.ts';

type Gate = { promise: Promise<void>; open: () => void };

function createGate(): Gate {
  let open: () => void = () => {};
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

describe('the queue worker', () => {
  it('runs four steps at once', async () => {
    const release = createGate();
    const fourRunning = createGate();
    let running = 0;
    const runStep = async (): Promise<'processed'> => {
      running += 1;
      if (running === 4) fourRunning.open();
      await release.promise;
      return 'processed';
    };
    const worker = startQueueWorker({ name: 'test', runStep, concurrency: 4, pause: pauseUntilStopped });

    await fourRunning.promise;

    expect(running).toBe(4);
    release.open();
    await worker.stop();
  });

  it('claims nothing new after it is stopped and waits for the steps in progress', async () => {
    const release = createGate();
    const started = createGate();
    let stepsStarted = 0;
    const runStep = async (): Promise<'processed'> => {
      stepsStarted += 1;
      started.open();
      await release.promise;
      return 'processed';
    };
    const worker = startQueueWorker({ name: 'test', runStep, concurrency: 1, pause: pauseUntilStopped });
    await started.promise;

    let stopped = false;
    const stopping = worker.stop().then(() => (stopped = true));
    await Promise.resolve();
    expect(stopped).toBe(false);
    release.open();
    await stopping;

    expect(stepsStarted).toBe(1);
  });

  it('pauses after an idle step or a failed step and then keeps going', async () => {
    const outcomes = [new Error('database down'), 'processed', 'idle'] as const;
    const secondPause = createGate();
    let stepsStarted = 0;
    const runStep = async (): Promise<'processed' | 'idle'> => {
      const outcome = outcomes[stepsStarted++];
      if (outcome instanceof Error) throw outcome;
      return outcome ?? 'idle';
    };
    let pauseCount = 0;
    const pause = (signal: AbortSignal): Promise<void> => {
      pauseCount += 1;
      if (pauseCount === 2) secondPause.open();
      return pauseCount <= 2 ? Promise.resolve() : pauseUntilStopped(signal);
    };
    const worker = startQueueWorker({ name: 'test', runStep, concurrency: 1, pause });

    await secondPause.promise;
    await worker.stop();

    expect(stepsStarted).toBeGreaterThanOrEqual(3);
  });
});

function pauseUntilStopped(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve()));
}
