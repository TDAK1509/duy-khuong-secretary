import OpenAI from 'openai';
import type { ChatRequest, ChatResult, ChatService } from '../../services/chat/chat-service.ts';

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

  constructor(settings: OpenAiCompatibleChatSettings) {
    this.model = settings.model;
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
    });
    return { ok: true, reply: { kind: 'text', text: '' } };
  }
}
