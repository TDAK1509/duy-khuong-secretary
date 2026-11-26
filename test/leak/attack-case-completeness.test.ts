import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_CHAT_TOOLS } from '../../src/app/admin-chat/tools/chat-tools.ts';
import { ATTACK_CASES } from './support/attack-cases.ts';

test('every admin chat tool has exactly one attack case', () => {
  const toolNames = ALL_CHAT_TOOLS.map((tool) => tool.name).sort();
  const caseNames = ATTACK_CASES.map((attackCase) => attackCase.name).sort();
  assert.deepEqual(caseNames, toolNames);
});
