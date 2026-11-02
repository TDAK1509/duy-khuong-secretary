import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { DraftProposals } from '../../src/app/admin-chat/draft-proposals.ts';
import { PhotoAttachments } from '../../src/app/admin-chat/photo-attachments.ts';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';

describe('the scheduling tools', () => {
  let harness: IntakeHarness;
  let workspaceId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ workspaceId } = harness);
  });

  afterEach(async () => {
    await harness.close();
  });

  function runTool(scope: AccessScope, name: string, args: unknown): Promise<string> {
    const dependencies = { database: harness.pool, clock: harness.clock, attachments: new PhotoAttachments(), drafts: new DraftProposals() };
    return runAdminTool(dependencies, scope, { id: 'call_1', name, argumentsJson: JSON.stringify(args) });
  }

  it('refuses a member who proposes a task', async () => {
    const hung: AccessScope = { workspaceId, userId: harness.hungUserId, role: 'member' };
    const proposal = { title: 'Báo cáo', instruction: 'Lập báo cáo.', repeat: 'daily', run_once_at: null, time_of_day: '18:00', weekday: null, day_of_month: null };

    const output = await runTool(hung, 'propose_scheduled_task', proposal);

    expect(output).toBe('{"ok":false,"error":"Không có quyền."}');
    expect(await harness.database.query('SELECT 1 FROM scheduled_tasks')).toEqual([]);
  });
});
