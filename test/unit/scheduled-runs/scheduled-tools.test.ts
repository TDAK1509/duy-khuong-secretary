import { describe, expect, it } from 'vitest';
import { SCHEDULED_RUN_TOOLS } from '../../../src/app/scheduled-runs/scheduled-tools.ts';

describe('the scheduled-run tools', () => {
  it('offers the document tools after the existing tools', () => {
    const names = SCHEDULED_RUN_TOOLS.map((tool) => tool.name);

    expect(names).toEqual([
      'search_records',
      'count_records',
      'maintenance_status',
      'list_members',
      'list_document_numbers',
      'total_document_numbers',
      'list_organizations',
    ]);
  });
});
