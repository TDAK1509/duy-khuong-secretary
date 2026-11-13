import { describe, expect, it } from 'vitest';
import { SCHEDULED_RUN_TOOLS } from '../../../src/app/scheduled-runs/scheduled-tools.ts';

describe('the number tools outside the admin chat', () => {
  it('stays out of the scheduled tool list', () => {
    const names = SCHEDULED_RUN_TOOLS.map((tool) => tool.name);

    expect(names).not.toContain('list_number_labels');
    expect(names).not.toContain('total_numbers');
  });
});
