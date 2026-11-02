import { afterEach, describe, expect, it } from 'vitest';
import {
  OpenAiCompatibleReader,
  type OpenAiCompatibleReaderSettings,
} from '../../src/providers/reading/openai-compatible-reader.ts';
import type { Photo } from '../../src/services/storage/photo-storage.ts';
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

  function makeReader(
    server: StubChatServer,
    overrides: Partial<OpenAiCompatibleReaderSettings> = {},
  ): OpenAiCompatibleReader {
    return new OpenAiCompatibleReader({
      baseUrl: server.baseUrl,
      apiKey: 'test-key',
      model: 'gpt-6-luna',
      timeoutMs: 5000,
      ...overrides,
    });
  }

  it('sends the model id of its slot', async () => {
    const server = await startServer(VALID_REPLY);

    await makeReader(server, { model: 'gpt-6-luna' }).read(REQUEST);

    expect(server.requests[0]?.body['model']).toBe('gpt-6-luna');
  });

  it('sends the photo as a JPEG data URL', async () => {
    const server = await startServer(VALID_REPLY);
    const image: Photo = { bytes: new Uint8Array([0xff, 0xd8, 0xff]), contentType: 'image/jpeg' };

    await makeReader(server).read({ ...REQUEST, image });

    const imageParts = listUserContentParts(server).filter((part) => part['type'] === 'image_url');
    expect(imageParts).toHaveLength(1);
    expect((imageParts[0]?.['image_url'] as { url: string }).url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('sends the schema in strict mode', async () => {
    const server = await startServer(VALID_REPLY);
    const schema = { type: 'object', properties: { has_work_data: { type: 'boolean' } } };

    await makeReader(server).read({ ...REQUEST, schemaName: 'work_message_reading', schema });

    expect(server.requests[0]?.body['response_format']).toEqual({
      type: 'json_schema',
      json_schema: { name: 'work_message_reading', schema, strict: true },
    });
  });

  it('sends the configured reasoning effort', async () => {
    const server = await startServer(VALID_REPLY);

    await makeReader(server, { reasoningEffort: 'low' }).read(REQUEST);

    expect(server.requests[0]?.body['reasoning_effort']).toBe('low');
  });
});

function listUserContentParts(server: StubChatServer): Record<string, unknown>[] {
  const messages = server.requests[0]?.body['messages'] as { role: string; content: Record<string, unknown>[] }[];
  return messages.find((message) => message.role === 'user')?.content ?? [];
}
