import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCHEDULED_RUN_TOOLS } from '../../src/app/schedules/runs/scheduled-tools.ts';
import { SCHEDULED_ATTACK_CASES } from './support/scheduled-attack-cases.ts';

test('every scheduled-run tool has exactly one attack case', () => {
  const toolNames = SCHEDULED_RUN_TOOLS.map((tool) => tool.name).sort();
  const caseNames = SCHEDULED_ATTACK_CASES.map((attackCase) => attackCase.name).sort();
  assert.deepEqual(caseNames, toolNames);
});
