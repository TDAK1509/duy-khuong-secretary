import { afterEach, describe, expect, it } from 'vitest';
import { OpenAiCompatibleChat, type OpenAiCompatibleChatSettings } from '../../src/providers/chat/openai-compatible-chat.ts';
import type { ChatRequest } from '../../src/services/chat/chat-service.ts';
import { makeCompletionReply, startStubChatServer, type StubChatServer, type StubReply } from './stub-chat-server.ts';

const TEXT_REPLY = makeCompletionReply('Chào anh');

const REQUEST: ChatRequest = {
  system: 'system prompt',
  turns: [{ role: 'user', text: 'xin chào', image: null }],
  tools: [],
};

describe('OpenAiCompatibleChat', () => {
  const servers: StubChatServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  async function startServer(reply: StubReply): Promise<StubChatServer> {
    const server = await startStubChatServer(reply);
    servers.push(server);
    return server;
  }

  function makeChat(server: StubChatServer, overrides: Partial<OpenAiCompatibleChatSettings> = {}): OpenAiCompatibleChat {
    return new OpenAiCompatibleChat({
      baseUrl: server.baseUrl,
      apiKey: 'test-key',
      model: 'gpt-6-luna',
      timeoutMs: 5000,
      ...overrides,
    });
  }

  it('sends the model and the system prompt first', async () => {
    const server = await startServer(TEXT_REPLY);

    await makeChat(server, { model: 'gpt-6-luna' }).respond({ ...REQUEST, system: 'S' });

    expect(server.requests[0]?.body['model']).toBe('gpt-6-luna');
    expect((server.requests[0]?.body['messages'] as unknown[])[0]).toEqual({ role: 'system', content: 'S' });
  });

  it('sends the configured reasoning effort', async () => {
    const server = await startServer(TEXT_REPLY);

    await makeChat(server, { reasoningEffort: 'none' }).respond(REQUEST);

    expect(server.requests[0]?.body['reasoning_effort']).toBe('none');
  });
});
