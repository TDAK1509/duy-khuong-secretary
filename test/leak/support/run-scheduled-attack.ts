import assert from 'node:assert/strict';
import { HeldTasks } from '../../../src/app/schedules/runs/held-tasks.ts';
import { runDueTasks } from '../../../src/app/schedules/runs/run-due-tasks.ts';
import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { assertModelReachedEveryTool } from './assert-model-reached-tools.ts';
import { FIXED_CLOCK } from './fixed-clock.ts';
import { collectPassedIds } from './leak-check.ts';
import { listAdminOutboundMessages } from './list-admin-outbound-messages.ts';
import { WORKSPACE_A_ID } from './seed-ids.ts';
import type { ScriptedChatModel } from './scripted-chat-model.ts';
import { listAddedOrChangedRows, snapshotWorkspace } from './snapshot-workspace.ts';
import { STUB_CHANNEL } from './stub-channel.ts';

export type ScheduledAttack = { owner: PostgresPool; database: PostgresPool; model: ScriptedChatModel };

export type ScheduledAttackOutcome = { observations: unknown[]; passedIds: string[] };

export async function runScheduledAttack({ owner, database, model }: ScheduledAttack): Promise<ScheduledAttackOutcome> {
  const rowsBefore = await snapshotWorkspace(owner, WORKSPACE_A_ID);
  const outboundBefore = await listAdminOutboundMessages(owner);
  await runDueTasks({ database, clock: FIXED_CLOCK, chat: model, channel: STUB_CHANNEL, held: new HeldTasks(), shutdown: new AbortController().signal });
  assertModelReachedEveryTool(model);
  const outbound = await listAdminOutboundMessages(owner);
  assert.ok(outbound.length > outboundBefore.length, 'the scheduled run queued no outbound message');
  const rowsWritten = listAddedOrChangedRows(rowsBefore, await snapshotWorkspace(owner, WORKSPACE_A_ID));
  return { observations: [model.requests, rowsWritten, outbound], passedIds: model.calls.flatMap((call) => collectPassedIds(call.argumentsJson)) };
}
