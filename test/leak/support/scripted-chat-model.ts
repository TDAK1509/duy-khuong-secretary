import type { ChatRequest, ChatResult, ChatService, ToolCall } from '../../../src/services/chat/chat-service.ts';
import { listAttackArguments, type AttackCase } from './attack-case.ts';

const MAX_CALLS_PER_ROUND = 5;

export class ScriptedChatModel implements ChatService {
  readonly model = 'leak-test-scripted-model';
  readonly requests: ChatRequest[] = [];
  readonly calls: ToolCall[];
  private nextCallIndex = 0;

  constructor(attackCases: AttackCase[]) {
    this.calls = listScriptedCalls(attackCases);
  }

  async respond(request: ChatRequest): Promise<ChatResult> {
    this.requests.push(request);
    const calls = this.calls.slice(this.nextCallIndex, this.nextCallIndex + MAX_CALLS_PER_ROUND);
    this.nextCallIndex += calls.length;
    if (calls.length > 0) return { ok: true, reply: { kind: 'tool_calls', calls, replayItems: [] }, usage: null };
    return { ok: true, reply: { kind: 'text', text: copyToolResults(request) }, usage: null };
  }

  readToolResults(): Map<string, string> {
    const lastRequest = this.requests.at(-1);
    return new Map(listToolResultTurns(lastRequest).map(({ callId, output }) => [callId, output]));
  }
}

function listScriptedCalls(attackCases: AttackCase[]): ToolCall[] {
  const aimedCalls = attackCases.flatMap((attackCase) => listAttackArguments(attackCase).map((toolArguments) => ({ name: attackCase.name, toolArguments })));
  return aimedCalls.map(({ name, toolArguments }, index) => ({ id: `leak-scripted-call-${index}`, name, argumentsJson: JSON.stringify(toolArguments) }));
}

function copyToolResults(request: ChatRequest): string {
  return listToolResultTurns(request).map(({ output }) => output).join('\n');
}

type ToolResultTurn = { callId: string; output: string };

function listToolResultTurns(request: ChatRequest | undefined): ToolResultTurn[] {
  return (request?.turns ?? []).flatMap((turn) => (turn.role === 'tool_result' ? [{ callId: turn.callId, output: turn.output }] : []));
}
