import { describe, expect, it, vi } from 'vitest';
import { OperatorAlerts } from '../../src/app/alerts/operator-alerts.ts';
import { FakeAlertSink } from '../fakes/fake-alert-sink.ts';
import { FakeClock } from '../fakes/fake-clock.ts';

const TEN_MINUTES_MS = 10 * 60 * 1000;

describe('OperatorAlerts', () => {
  it('sends the same alert once when it is raised twice within an hour', async () => {
    const sink = new FakeAlertSink();
    const clock = new FakeClock(new Date('2026-11-02T10:00:00+07:00'));
    const alerts = new OperatorAlerts(sink, clock);

    await alerts.raise('x');
    clock.advanceBy(TEN_MINUTES_MS);
    await alerts.raise('x');

    expect(sink.texts).toEqual(['x']);
  });

  it('sends the same alert again after an hour', async () => {
    const sink = new FakeAlertSink();
    const clock = new FakeClock(new Date('2026-11-02T10:00:00+07:00'));
    const alerts = new OperatorAlerts(sink, clock);

    await alerts.raise('x');
    clock.advanceBy(60 * 60 * 1000);
    await alerts.raise('x');

    expect(sink.texts).toEqual(['x', 'x']);
  });

  it('logs a failing sink and does not stop the caller', async () => {
    const failingSink = { notify: () => Promise.reject(new Error('webhook down')) };
    const alerts = new OperatorAlerts(failingSink, new FakeClock(new Date('2026-11-02T10:00:00+07:00')));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(alerts.raise('x')).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledWith('[alerts] the alert sink failed:', 'Error');
    logged.mockRestore();
  });
});
