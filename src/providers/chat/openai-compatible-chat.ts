import OpenAI from 'openai';
import type { ChatRequest, ChatResult, ChatService, ToolSpec } from '../../services/chat/chat-service.ts';

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
      messages: [{ role: 'system', content: request.system }],
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
