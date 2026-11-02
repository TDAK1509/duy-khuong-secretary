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

  it('logs which alert failed and the HTTP status, never the webhook URL', async () => {
    const failure = Object.assign(new Error('POST https://hooks.example/secret-path failed'), { status: 502 });
    const alerts = new OperatorAlerts(
      { notify: () => Promise.reject(failure) },
      new FakeClock(new Date('2026-11-02T10:00:00+07:00')),
    );
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(alerts.raise('x')).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledWith('[alerts] could not send alert:', 'x', 'HTTP 502');
    expect(JSON.stringify(logged.mock.calls)).not.toContain('secret-path');
    logged.mockRestore();
  });

  it('logs the error name when the failing sink has no HTTP status', async () => {
    const alerts = new OperatorAlerts(
      { notify: () => Promise.reject(new TypeError('fetch failed')) },
      new FakeClock(new Date('2026-11-02T10:00:00+07:00')),
    );
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await alerts.raise('x');

    expect(logged).toHaveBeenCalledWith('[alerts] could not send alert:', 'x', 'TypeError');
    logged.mockRestore();
  });
});
