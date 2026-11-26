import assert from 'node:assert/strict';
import { assertReachedTool } from './run-attack-case.ts';
import type { ScriptedChatModel } from './scripted-chat-model.ts';

const TOOL_FAILED_PREFIX = 'Công cụ gặp lỗi khi chạy';

export function assertModelReachedEveryTool(model: ScriptedChatModel): void {
  const results = model.readToolResults();
  for (const call of model.calls) {
    const output = results.get(call.id);
    assert.ok(output !== undefined, `the ${call.name} call got no tool result: the tool loop ended before it ran`);
    assertReachedTool(call.name, JSON.parse(call.argumentsJson), output);
    assert.ok(!output.includes(TOOL_FAILED_PREFIX), `the ${call.name} call failed while it ran: ${output}`);
  }
}
