import { describe, expect, it } from 'vitest';
import { formatTaskSummary } from '../../../src/app/schedules/format-task-summary.ts';

describe('the summary of a scheduled task', () => {
  it('has no maintenance reminder line', () => {
    const summary = formatTaskSummary({
      title: 'Nhắc bảo dưỡng',
      schedule: { repeat: 'daily', timeOfDay: '07:00' },
      firstRun: new Date('2026-11-01T07:00:00+07:00'),
      instruction: 'Dùng maintenance_status để nhắc thay dầu.',
    });

    expect(summary).not.toContain('Nhắc bảo dưỡng:');
    expect(summary.split('\n')).toHaveLength(5);
  });
});
