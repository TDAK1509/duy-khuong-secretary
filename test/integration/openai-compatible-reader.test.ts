import { afterEach, describe, expect, it } from 'vitest';
import {
  OpenAiCompatibleReader,
  type OpenAiCompatibleReaderSettings,
} from '../../src/providers/reading/openai-compatible-reader.ts';
import type { Photo } from '../../src/services/storage/photo-storage.ts';
import type { ReaderRequest } from '../../src/services/reading/reader-service.ts';
import { makeCompletionReply, startStubChatServer, type StubChatServer, type StubReply } from './stub-chat-server.ts';

const VALID_JSON = '{"has_work_data":false,"has_question":true,"items":[]}';
const VALID_REPLY = makeCompletionReply(VALID_JSON);

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

  it('sends no reasoning effort when none is configured', async () => {
    const server = await startServer(VALID_REPLY);

    await makeReader(server).read(REQUEST);

    expect(server.requests[0]?.body).not.toHaveProperty('reasoning_effort');
  });

  it('returns the JSON reply parsed', async () => {
    const server = await startServer(VALID_REPLY);

    const result = await makeReader(server).read(REQUEST);

    expect(result).toEqual({
      ok: true,
      json: { has_work_data: false, has_question: true, items: [] },
      usage: { input: 'unknown', output: 'unknown', reasoning: 'unknown' },
    });
  });

  it('returns the token counts of a reply with usage', async () => {
    const usage = { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140, completion_tokens_details: { reasoning_tokens: 10 } };
    const server = await startServer(makeCompletionReply(VALID_JSON, usage));

    const result = await makeReader(server).read(REQUEST);

    expect(result).toMatchObject({ ok: true, usage: { input: 100, output: 40, reasoning: 10 } });
  });

  it('returns unknown token counts for a reply without usage', async () => {
    const server = await startServer(VALID_REPLY);

    const result = await makeReader(server).read(REQUEST);

    expect(result).toMatchObject({ ok: true, usage: { input: 'unknown', output: 'unknown', reasoning: 'unknown' } });
  });

  it('keeps the token counts of a reply that is not JSON', async () => {
    const usage = { prompt_tokens: 100, completion_tokens: 5, total_tokens: 105 };
    const server = await startServer(makeCompletionReply('not json', usage));

    const result = await makeReader(server).read(REQUEST);

    expect(result).toMatchObject({ ok: false, reason: 'invalid_output', usage: { input: 100 } });
  });

  it('turns a slow reply into a timeout', async () => {
    const server = await startServer({ ...VALID_REPLY, delayMs: 500 });

    const result = await makeReader(server, { timeoutMs: 100 }).read(REQUEST);

    expect(result).toEqual({ ok: false, reason: 'timeout' });
  });

  it('turns a reply that is not JSON into invalid output', async () => {
    const server = await startServer(makeCompletionReply('Xin chào'));

    const result = await makeReader(server).read(REQUEST);

    expect(result).toEqual({
      ok: false,
      reason: 'invalid_output',
      usage: { input: 'unknown', output: 'unknown', reasoning: 'unknown' },
    });
  });

  it('turns a server error into unavailable', async () => {
    const server = await startServer({ status: 500, body: { error: { message: 'boom' } } });

    const result = await makeReader(server).read(REQUEST);

    expect(result).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('turns an authentication error into unavailable', async () => {
    const server = await startServer({ status: 401, body: { error: { message: 'bad key' } } });

    const result = await makeReader(server).read(REQUEST);

    expect(result).toEqual({ ok: false, reason: 'unavailable' });
  });
});

function listUserContentParts(server: StubChatServer): Record<string, unknown>[] {
  const messages = server.requests[0]?.body['messages'] as { role: string; content: Record<string, unknown>[] }[];
  return messages.find((message) => message.role === 'user')?.content ?? [];
}
