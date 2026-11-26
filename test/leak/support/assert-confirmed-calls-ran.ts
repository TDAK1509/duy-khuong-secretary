import assert from 'node:assert/strict';
import type { StoredCall } from '../../../src/app/admin-chat/changes/stored-call.ts';
import { assertReachedTool } from './run-attack-case.ts';
import type { ScriptedChatModel } from './scripted-chat-model.ts';

const TOOL_RESULT_BLOCK = /<retrieved-data source="tool:([a-z_]+)">\n([\s\S]*?)\n<\/retrieved-data>/g;

export function assertConfirmedCallsRan(model: ScriptedChatModel, storedCalls: StoredCall[]): void {
  const results = [...readContextText(model).matchAll(TOOL_RESULT_BLOCK)].map(([, name = '', output = '']) => ({ name, output }));
  assert.deepEqual(results.map(({ name }) => name), storedCalls.map(({ name }) => name), 'the model request does not hold every confirmed call result');
  for (const [index, { output }] of results.entries()) {
    const call = storedCalls[index];
    if (call !== undefined) assertReachedTool(call.name, Object(call.arguments), output);
  }
}

function readContextText(model: ScriptedChatModel): string {
  const [contextTurn] = model.requests[0]?.turns ?? [];
  return contextTurn?.role === 'user' ? (contextTurn.text ?? '') : '';
}
