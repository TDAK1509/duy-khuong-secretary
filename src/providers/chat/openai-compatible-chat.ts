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
    await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'system', content: request.system }],
      reasoning_effort: this.reasoningEffort,
      tools: request.tools.length > 0 ? request.tools.map(toFunctionTool) : undefined,
    });
    return { ok: true, reply: { kind: 'text', text: '' } };
  }
}

function toFunctionTool(tool: ToolSpec): OpenAI.Chat.ChatCompletionTool {
  return { type: 'function', function: { ...tool, strict: true } };
}
