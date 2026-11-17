import OpenAI from 'openai';
import type { ChatRequest, ChatResult, ChatService, ChatTurn, ToolCall, ToolSpec } from '../../services/chat/chat-service.ts';
import { readResponseUsage } from '../../services/usage/read-response-usage.ts';

export type OpenAiCompatibleChatSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  reasoningEffort?: string;
};

export class OpenAiCompatibleChat implements ChatService {
  private readonly client: OpenAI;
  readonly model: string;
  private readonly reasoningEffort: OpenAI.ReasoningEffort | undefined;

  constructor(settings: OpenAiCompatibleChatSettings) {
    this.model = settings.model;
    this.reasoningEffort = (settings.reasoningEffort || undefined) as OpenAI.ReasoningEffort | undefined;
    this.client = new OpenAI({
      baseURL: settings.baseUrl,
      apiKey: settings.apiKey,
      timeout: settings.timeoutMs,
      maxRetries: 0,
    });
  }

  async respond(request: ChatRequest): Promise<ChatResult> {
    try {
      const response = await this.client.responses.create(this.buildParameters(request));
      return { ok: true, reply: readReply(response), usage: readResponseUsage(response.usage) };
    } catch (error) {
      if (error instanceof OpenAI.APIConnectionTimeoutError) return { ok: false, reason: 'timeout' };
      logChatFailure(this.model, error);
      return { ok: false, reason: 'unavailable' };
    }
  }

  private buildParameters(request: ChatRequest): OpenAI.Responses.ResponseCreateParamsNonStreaming {
    const mayReason = this.reasoningEffort !== 'none';
    return {
      model: this.model,
      instructions: request.system,
      input: request.turns.flatMap(buildInputItems),
      store: false,
      ...(this.reasoningEffort === undefined ? {} : { reasoning: { effort: this.reasoningEffort } }),
      ...(mayReason ? { include: ['reasoning.encrypted_content'] } : {}),
      tools: request.tools.length > 0 ? request.tools.map(toFunctionTool) : undefined,
    };
  }
}

const MAX_LOGGED_MESSAGE_LENGTH = 300;

function logChatFailure(model: string, error: unknown): void {
  const status = error instanceof OpenAI.APIError ? String(error.status ?? 'none') : 'none';
  const message = error instanceof Error ? error.message.slice(0, MAX_LOGGED_MESSAGE_LENGTH) : 'unknown error';
  console.error(`[chat] model=${model} failed status=${status} message=${message}`);
}

function readReply(response: OpenAI.Responses.Response): Extract<ChatResult, { ok: true }>['reply'] {
  const calls = response.output.filter((item) => item.type === 'function_call');
  if (calls.length > 0) return { kind: 'tool_calls', calls: calls.map(toChatToolCall), replayItems: response.output.filter(isReplayable) };
  return { kind: 'text', text: response.output_text };
}

function isReplayable(item: OpenAI.Responses.ResponseOutputItem): boolean {
  return item.type !== 'reasoning' || Boolean(item.encrypted_content);
}

function toChatToolCall(call: OpenAI.Responses.ResponseFunctionToolCall): ToolCall {
  return { id: call.call_id, name: call.name, argumentsJson: call.arguments };
}

function toFunctionTool(tool: ToolSpec): OpenAI.Responses.FunctionTool {
  return { type: 'function', name: tool.name, description: tool.description, parameters: tool.parameters, strict: true };
}

function buildInputItems(turn: ChatTurn): OpenAI.Responses.ResponseInputItem[] {
  switch (turn.role) {
    case 'user':
      return turn.text === null ? [] : [{ role: 'user', content: turn.text }];
    case 'assistant':
      return [{ role: 'assistant', content: turn.text }];
    case 'assistant_tool_calls':
      return turn.replayItems as OpenAI.Responses.ResponseInputItem[];
    case 'tool_result':
      return [{ type: 'function_call_output', call_id: turn.callId, output: turn.output }];
  }
}
