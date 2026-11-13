import type { ChatRequest, ChatResult, ChatService, ToolCall } from '../../src/services/chat/chat-service.ts';
import type { TokenUsage } from '../../src/services/usage/token-usage.ts';

type Script = (request: ChatRequest, callNumber: number) => ChatResult | Promise<ChatResult>;

export class FakeChatService implements ChatService {
  readonly model = 'gpt-6-luna';
  readonly requests: ChatRequest[] = [];
  private script: Script = () => replyWithText('Chào anh');

  replyWith(text: string, usage: TokenUsage | null = null): void {
    this.script = () => replyWithText(text, usage);
  }

  failWith(reason: 'timeout' | 'unavailable'): void {
    this.script = () => ({ ok: false, reason });
  }

  follow(script: Script): void {
    this.script = script;
  }

  async respond(request: ChatRequest): Promise<ChatResult> {
    this.requests.push(request);
    return this.script(request, this.requests.length);
  }
}

export function replyWithText(text: string, usage: TokenUsage | null = null): ChatResult {
  return { ok: true, reply: { kind: 'text', text }, usage };
}

export function replyWithToolCalls(...calls: ToolCall[]): ChatResult {
  return { ok: true, reply: { kind: 'tool_calls', calls }, usage: null };
}
