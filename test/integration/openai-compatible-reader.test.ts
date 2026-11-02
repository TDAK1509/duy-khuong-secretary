import { afterEach, describe, expect, it } from 'vitest';
import { OpenAiCompatibleReader } from '../../src/providers/reading/openai-compatible-reader.ts';
import type { ReaderRequest } from '../../src/services/reading/reader-service.ts';
import { makeCompletionReply, startStubChatServer, type StubChatServer, type StubReply } from './stub-chat-server.ts';

const VALID_REPLY = makeCompletionReply('{"has_work_data":false,"has_question":true,"items":[]}');

const REQUEST: ReaderRequest = {
  system: 'system prompt',
  text: 'xin chào',
  image: null,
  schemaName: 'work_message_reading',
  schema: { type: 'object' },
};

describe('OpenAiCompatibleReader', () => {
  const servers: StubChatServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  async function startServer(reply: StubReply): Promise<StubChatServer> {
    const server = await startStubChatServer(reply);
    servers.push(server);
    return server;
  }

  function makeReader(server: StubChatServer, model = 'gpt-6-luna'): OpenAiCompatibleReader {
    return new OpenAiCompatibleReader({ baseUrl: server.baseUrl, apiKey: 'test-key', model, timeoutMs: 5000 });
  }

  it('sends the model id of its slot', async () => {
    const server = await startServer(VALID_REPLY);

    await makeReader(server, 'gpt-6-luna').read(REQUEST);

    expect(server.requests[0]?.body['model']).toBe('gpt-6-luna');
  });
});
