import OpenAI from 'openai';
import type { Photo } from '../../services/storage/photo-storage.ts';
import type { ChatRequest, ChatResult, ChatService, ChatTurn, ToolCall, ToolSpec } from '../../services/chat/chat-service.ts';

export type OpenAiCompatibleChatSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  reasoningEffort?: string;
};

export class OpenAiCompatibleChat implements ChatService {
  private readonly client: OpenAI;
  private readonly model: string;
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
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'system', content: request.system }, ...request.turns.map(toMessage)],
      reasoning_effort: this.reasoningEffort,
      tools: request.tools.length > 0 ? request.tools.map(toFunctionTool) : undefined,
    });
    return { ok: true, reply: readReply(completion) };
  }
}

function readReply(completion: OpenAI.Chat.ChatCompletion): Extract<ChatResult, { ok: true }>['reply'] {
  const message = completion.choices[0]?.message;
  const calls = (message?.tool_calls ?? []).filter((call) => call.type === 'function');
  return { kind: 'tool_calls', calls: calls.map((call) => ({ id: call.id, name: call.function.name, argumentsJson: call.function.arguments })) };
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
  const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];
  if (turn.text !== null) parts.push({ type: 'text', text: turn.text });
  if (turn.image !== null) parts.push({ type: 'image_url', image_url: { url: toDataUrl(turn.image) } });
  return parts;
}

function toDataUrl(photo: Photo): string {
  return `data:${photo.contentType};base64,${Buffer.from(photo.bytes).toString('base64')}`;
}
