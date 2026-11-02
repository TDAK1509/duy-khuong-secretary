import type { ChatRequest, ChatService, ChatTurn, ToolCall } from '../../services/chat/chat-service.ts';
import { CHAT_FAILURE_TEXT, TOOL_LOOP_TEXT } from './chat-texts.ts';

const MAX_TOOL_ROUNDS = 5;

export type RunTool = (call: ToolCall) => Promise<string>;

export async function runToolLoop(chat: ChatService, request: ChatRequest, runTool: RunTool): Promise<string> {
  let turns = request.turns;
  for (let round = 0; ; round += 1) {
    const result = await chat.respond({ ...request, turns });
    if (!result.ok) return CHAT_FAILURE_TEXT;
    if (result.reply.kind === 'text') return result.reply.text;
    if (round === MAX_TOOL_ROUNDS) return TOOL_LOOP_TEXT;
    turns = [...turns, ...(await runToolRound(result.reply.calls, runTool))];
  }
}

async function runToolRound(calls: ToolCall[], runTool: RunTool): Promise<ChatTurn[]> {
  const results: ChatTurn[] = [];
  for (const call of calls) results.push({ role: 'tool_result', callId: call.id, output: await runTool(call) });
  return [{ role: 'assistant_tool_calls', calls }, ...results];
}
