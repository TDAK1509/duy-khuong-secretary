import { describe, expect, it } from 'vitest';
import { runToolLoop } from '../../../src/app/admin-chat/run-tool-loop.ts';
import type { ChatRequest } from '../../../src/services/chat/chat-service.ts';
import { FakeChatService } from '../../fakes/fake-chat-service.ts';

const REQUEST: ChatRequest = { system: 'prompt', turns: [{ role: 'user', text: 'Chào' }], tools: [] };

describe('the tool loop', () => {
  it('answers a text reply without tools', async () => {
    const chat = new FakeChatService();
    chat.replyWith('Chào anh');

    const result = await runToolLoop(chat, REQUEST, async () => '{}');

    expect(result).toEqual({ outcome: 'answered', text: 'Chào anh' });
  });
});
