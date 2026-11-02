import type { ChatRequest, ChatService, ChatTurn, ToolCall } from '../../services/chat/chat-service.ts';
import { failInvalidArgument } from './tools/tool-result.ts';
import { CHAT_FAILURE_TEXT, TOOL_LOOP_TEXT } from './chat-texts.ts';

const MAX_TOOL_ROUNDS = 5;
const MAX_CALLS_PER_ROUND = 5;

export type RunTool = (call: ToolCall) => Promise<string>;

export type ToolLoopOutcome = { ok: true; text: string } | { ok: false; text: string };

export async function runToolLoop(chat: ChatService, request: ChatRequest, runTool: RunTool): Promise<ToolLoopOutcome> {
  let turns = request.turns;
  for (let round = 0; ; round += 1) {
    const result = await chat.respond({ ...request, turns });
    if (!result.ok) return { ok: false, text: CHAT_FAILURE_TEXT };
    if (result.reply.kind === 'text') return { ok: true, text: result.reply.text };
    if (round === MAX_TOOL_ROUNDS) return { ok: false, text: TOOL_LOOP_TEXT };
    turns = [...turns, ...(await runToolRound(result.reply.calls, runTool))];
  }
}

async function runToolRound(calls: ToolCall[], runTool: RunTool): Promise<ChatTurn[]> {
  const results: ChatTurn[] = [];
  for (const [index, call] of calls.entries()) {
    const output = index < MAX_CALLS_PER_ROUND ? await runTool(call) : failInvalidArgument('calls');
    results.push({ role: 'tool_result', callId: call.id, output });
  }
  return [{ role: 'assistant_tool_calls', calls }, ...results];
}
