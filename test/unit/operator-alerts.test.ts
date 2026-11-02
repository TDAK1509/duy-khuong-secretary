import { describe, expect, it } from 'vitest';
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
});
