import type { ChatRequest, ChatResult, ChatService } from '../../../src/services/chat/chat-service.ts';

export class CountingChatService implements ChatService {
  readonly model = 'leak-test-chat';
  readonly requests: ChatRequest[] = [];

  async respond(request: ChatRequest): Promise<ChatResult> {
    this.requests.push(request);
    return { ok: false, reason: 'unavailable' };
  }
}
