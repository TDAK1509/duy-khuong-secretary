import type { ChatRequest, ChatResult, ChatService, ChatTurn, ToolCall } from '../../services/chat/chat-service.ts';
import { failInvalidArgument } from './tools/tool-result.ts';
import { CHAT_FAILURE_TEXT, TOOL_LOOP_TEXT } from './chat-texts.ts';
import { wrapRetrievedData } from '../reading/retrieved-data.ts';
import { describeToolCall, describeToolOutput, NOT_RUN, THREW } from './describe-tool-call.ts';

export const DEFAULT_TOOL_ROUNDS = 5;
export const ADMIN_TOOL_ROUNDS = 15;
const MAX_CALLS_PER_ROUND = 5;

export type RunTool = (call: ToolCall) => Promise<string>;

type ToolCallsReply = Extract<Extract<ChatResult, { ok: true }>['reply'], { kind: 'tool_calls' }>;

export type ToolLoopOutcome = 'answered' | 'tool_round_limit' | 'chat_failed';

export type ToolLoopResult = { outcome: ToolLoopOutcome; text: string };

export type LoggedCall = { tool: string; arguments: string; result: string };

export type LoggedRound = { calls: LoggedCall[]; ran: boolean };

export async function runToolLoop(
  chat: ChatService,
  request: ChatRequest,
  runTool: RunTool,
  rounds: LoggedRound[] = [],
  maxRounds = DEFAULT_TOOL_ROUNDS,
): Promise<ToolLoopResult> {
  let turns = request.turns;
  for (let round = 0; ; round += 1) {
    const result = await chat.respond({ ...request, turns });
    if (!result.ok) return { outcome: 'chat_failed', text: CHAT_FAILURE_TEXT };
    if (result.reply.kind === 'text') return { outcome: 'answered', text: result.reply.text };
    if (round === maxRounds) {
      rounds.push({ ran: false, calls: result.reply.calls.map(describeNotRunCall) });
      return { outcome: 'tool_round_limit', text: TOOL_LOOP_TEXT };
    }
    turns = [...turns, ...(await runToolRound(result.reply, runTool, rounds))];
  }
}

function describeNotRunCall(call: ToolCall): LoggedCall {
  return { ...describeToolCall(call), result: NOT_RUN };
}

async function runToolRound({ calls, replayItems }: ToolCallsReply, runTool: RunTool, rounds: LoggedRound[]): Promise<ChatTurn[]> {
  const results: ChatTurn[] = [];
  const logged: LoggedCall[] = [];
  rounds.push({ calls: logged, ran: true });
  for (const [index, call] of calls.entries()) {
    const output = index < MAX_CALLS_PER_ROUND ? await runCall(call, runTool, logged) : skipCall(call, logged);
    results.push({ role: 'tool_result', callId: call.id, output: wrapRetrievedData(`tool:${readToolLabel(call.name)}`, output) });
  }
  return [{ role: 'assistant_tool_calls', calls, replayItems }, ...results];
}

const TOOL_NAME = /^[a-z][a-z_]{0,63}$/;

function readToolLabel(name: string): string {
  return TOOL_NAME.test(name) ? name : 'unknown';
}

async function runCall(call: ToolCall, runTool: RunTool, logged: LoggedCall[]): Promise<string> {
  try {
    const output = await runTool(call);
    logged.push({ ...describeToolCall(call), result: describeToolOutput(output) });
    return output;
  } catch (error) {
    logged.push({ ...describeToolCall(call), result: THREW });
    throw error;
  }
}

function skipCall(call: ToolCall, logged: LoggedCall[]): string {
  logged.push(describeNotRunCall(call));
  return failInvalidArgument('calls');
}
