import { describe, expect, it } from 'vitest';
import { CREATE_SCHEDULED_TASK_SPEC } from '../../../src/app/admin-chat/tools/tool-specs.ts';

describe('the create_scheduled_task spec', () => {
  it('has no maintenance_rules property', () => {
    const parameters = CREATE_SCHEDULED_TASK_SPEC.parameters as { properties: object; required: string[] };

    expect(Object.keys(parameters.properties)).not.toContain('maintenance_rules');
    expect(parameters.required).not.toContain('maintenance_rules');
  });
});
