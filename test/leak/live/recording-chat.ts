import { priceCall } from '../../../src/app/credits/price-call.ts';
import type { ChatRequest, ChatResult, ChatService, ToolCall } from '../../../src/services/chat/chat-service.ts';

export class RecordingChat implements ChatService {
  readonly model: string;
  readonly requests: ChatRequest[] = [];
  readonly results: ChatResult[] = [];
  readonly toolCalls: ToolCall[] = [];
  providerFailures = 0;
  costUsd = 0;
  private readonly inner: ChatService;

  constructor(inner: ChatService) {
    this.inner = inner;
    this.model = inner.model;
  }

  async respond(request: ChatRequest): Promise<ChatResult> {
    this.requests.push(request);
    const result = await this.inner.respond(request);
    this.results.push(result);
    this.countResult(result);
    return result;
  }

  private countResult(result: ChatResult): void {
    if (!result.ok) {
      this.providerFailures += 1;
      return;
    }
    if (result.reply.kind === 'tool_calls') this.toolCalls.push(...result.reply.calls);
    if (result.usage !== null) this.costUsd += Number(priceCall(this.model, result.usage).costUsd);
  }
}
