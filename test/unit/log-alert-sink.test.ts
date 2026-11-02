import { describe, expect, it, vi } from 'vitest';
import { LogAlertSink } from '../../src/providers/alerts/log-alert-sink.ts';

describe('LogAlertSink', () => {
  it('writes the alert text to the error log', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await new LogAlertSink().notify('[alert] test');

    expect(logged).toHaveBeenCalledWith('[alert] test');
    logged.mockRestore();
  });
});
