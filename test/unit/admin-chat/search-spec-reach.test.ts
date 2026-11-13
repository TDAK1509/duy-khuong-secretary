import { describe, expect, it } from 'vitest';
import { SEARCH_RECORDS_SPEC } from '../../../src/app/admin-chat/tools/tool-specs.ts';
import { SCHEDULED_RUN_TOOLS } from '../../../src/app/scheduled-runs/scheduled-tools.ts';

describe('the search_records spec outside the admin chat', () => {
  it('stays without a document date range in the scheduled tool list', () => {
    const tool = SCHEDULED_RUN_TOOLS.find((candidate) => candidate.name === 'search_records');

    expect(tool).toEqual(SEARCH_RECORDS_SPEC);
    expect(Object.keys(tool?.parameters['properties'] as Record<string, unknown>)).not.toContain('occurred_from');
  });
});
