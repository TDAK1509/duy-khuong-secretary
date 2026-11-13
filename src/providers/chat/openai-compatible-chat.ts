import OpenAI from 'openai';
import type { ChatRequest, ChatResult, ChatService, ChatTurn, ToolCall, ToolSpec } from '../../services/chat/chat-service.ts';
import { readTokenUsage } from '../../services/usage/read-token-usage.ts';

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
      const completion = await this.client.chat.completions.create(this.buildParameters(request));
      return { ok: true, reply: readReply(completion), usage: readTokenUsage(completion.usage) };
    } catch (error) {
      if (error instanceof OpenAI.APIConnectionTimeoutError) return { ok: false, reason: 'timeout' };
      return { ok: false, reason: 'unavailable' };
    }
  }

  private buildParameters(request: ChatRequest): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming {
    return {
      model: this.model,
      messages: [{ role: 'system', content: request.system }, ...request.turns.map(toMessage)],
      reasoning_effort: this.reasoningEffort,
      tools: request.tools.length > 0 ? request.tools.map(toFunctionTool) : undefined,
    };
  }
}

function readReply(completion: OpenAI.Chat.ChatCompletion): Extract<ChatResult, { ok: true }>['reply'] {
  const message = completion.choices[0]?.message;
  const calls = (message?.tool_calls ?? []).filter((call) => call.type === 'function');
  if (calls.length > 0) return { kind: 'tool_calls', calls: calls.map(toChatToolCall) };
  return { kind: 'text', text: message?.content ?? '' };
}

function toChatToolCall(call: OpenAI.Chat.ChatCompletionMessageFunctionToolCall): ToolCall {
  return { id: call.id, name: call.function.name, argumentsJson: call.function.arguments };
}

function toFunctionTool(tool: ToolSpec): OpenAI.Chat.ChatCompletionTool {
  return { type: 'function', function: { ...tool, strict: true } };
}

function toMessage(turn: ChatTurn): OpenAI.Chat.ChatCompletionMessageParam {
  switch (turn.role) {
    case 'user':
      return { role: 'user', content: buildUserContent(turn) };
    case 'assistant':
      return { role: 'assistant', content: turn.text };
    case 'assistant_tool_calls':
      return { role: 'assistant', content: null, tool_calls: turn.calls.map(toToolCall) };
    case 'tool_result':
      return { role: 'tool', tool_call_id: turn.callId, content: turn.output };
  }
}

function toToolCall(call: ToolCall): OpenAI.Chat.ChatCompletionMessageToolCall {
  return { id: call.id, type: 'function', function: { name: call.name, arguments: call.argumentsJson } };
}

function buildUserContent(turn: Extract<ChatTurn, { role: 'user' }>): OpenAI.Chat.ChatCompletionContentPart[] {
  return turn.text === null ? [] : [{ type: 'text', text: turn.text }];
}
