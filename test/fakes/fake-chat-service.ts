import type { ChatRequest, ChatResult, ChatService, ToolCall } from '../../src/services/chat/chat-service.ts';

type Script = (request: ChatRequest, callNumber: number) => ChatResult | Promise<ChatResult>;

export class FakeChatService implements ChatService {
  readonly requests: ChatRequest[] = [];
  private script: Script = () => replyWithText('Chào anh');

  replyWith(text: string): void {
    this.script = () => replyWithText(text);
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

export function replyWithText(text: string): ChatResult {
  return { ok: true, reply: { kind: 'text', text } };
}

export function replyWithToolCalls(...calls: ToolCall[]): ChatResult {
  return { ok: true, reply: { kind: 'tool_calls', calls } };
}
