import assert from 'node:assert/strict';
import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { REFUSAL_ERROR } from '../../../src/app/admin-chat/tools/tool-result.ts';
import type { AttackCase } from './attack-case.ts';
import { collectPassedIds } from './leak-check.ts';
import { observeToolSideEffects } from './observe-tool-side-effects.ts';
import { WORKSPACE_A_ID } from './seed-ids.ts';
import { listAddedRows, snapshotWorkspace } from './snapshot-workspace.ts';
import { createToolHarness, type ToolPath } from './tool-harness.ts';

const INVALID_ARGUMENT_PREFIX = 'Dữ liệu không hợp lệ';

export type AttackRun = { owner: PostgresPool; database: PostgresPool; attackCase: AttackCase; path: ToolPath };

export type AttackOutcome = { output: string; observations: unknown[]; passedIds: string[] };

export async function runAttackCase({ owner, database, attackCase, path }: AttackRun): Promise<AttackOutcome> {
  const harness = createToolHarness(database);
  const rowsBefore = await snapshotWorkspace(owner, WORKSPACE_A_ID);
  const output = await harness.runTool(path, attackCase.name, attackCase.arguments);
  assertReachedTool(attackCase, output);
  const rowsWritten = listAddedRows(rowsBefore, await snapshotWorkspace(owner, WORKSPACE_A_ID));
  const observations = [output, rowsWritten, ...(await observeToolSideEffects(harness))];
  return { output, observations, passedIds: collectPassedIds(attackCase.arguments) };
}

function assertReachedTool({ name, arguments: toolArguments }: AttackCase, output: string): void {
  const message = `the ${name} attack case was refused before it reached the tool: ${output} for ${JSON.stringify(toolArguments)}`;
  assert.ok(!output.includes(INVALID_ARGUMENT_PREFIX) && !output.includes(REFUSAL_ERROR), message);
}
