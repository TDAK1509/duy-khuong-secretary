import { afterEach, describe, expect, it } from 'vitest';
import { OpenAiCompatibleChat, type OpenAiCompatibleChatSettings } from '../../src/providers/chat/openai-compatible-chat.ts';
import type { ChatRequest } from '../../src/services/chat/chat-service.ts';
import type { Photo } from '../../src/services/storage/photo-storage.ts';
import { makeCompletionReply, makeToolCallReply, startStubChatServer, type StubChatServer, type StubReply } from './stub-chat-server.ts';

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

  it('does not send an empty reasoning effort', async () => {
    const server = await startServer(TEXT_REPLY);

    await makeChat(server, { reasoningEffort: '' }).respond(REQUEST);

    expect(server.requests[0]?.body).not.toHaveProperty('reasoning_effort');
  });

  it('sends tools as strict functions', async () => {
    const server = await startServer(TEXT_REPLY);
    const tool = { name: 'list_members', description: 'Liệt kê', parameters: { type: 'object' } };

    await makeChat(server).respond({ ...REQUEST, tools: [tool] });

    expect(server.requests[0]?.body['tools']).toEqual([
      { type: 'function', function: { name: 'list_members', description: 'Liệt kê', parameters: { type: 'object' }, strict: true } },
    ]);
  });

  it('turns a tool-call answer into tool calls with ids', async () => {
    const server = await startServer(makeToolCallReply([{ id: 'call_1', name: 'list_members', arguments: '{}' }]));

    const result = await makeChat(server).respond(REQUEST);

    expect(result).toEqual({
      ok: true,
      reply: { kind: 'tool_calls', calls: [{ id: 'call_1', name: 'list_members', argumentsJson: '{}' }] },
    });
  });

  it('sends a tool result back with its call id', async () => {
    const server = await startServer(TEXT_REPLY);
    const call = { id: 'call_1', name: 'list_members', argumentsJson: '{}' };

    await makeChat(server).respond({
      ...REQUEST,
      turns: [
        ...REQUEST.turns,
        { role: 'assistant_tool_calls', calls: [call] },
        { role: 'tool_result', callId: 'call_1', output: '{"members":[]}' },
      ],
    });

    expect((server.requests[0]?.body['messages'] as unknown[]).slice(2)).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'list_members', arguments: '{}' } }],
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{"members":[]}' },
    ]);
  });

  it('sends a user photo as an image part', async () => {
    const server = await startServer(TEXT_REPLY);
    const image: Photo = { bytes: new Uint8Array([0xff, 0xd8, 0xff]), contentType: 'image/jpeg' };

    await makeChat(server).respond({ ...REQUEST, turns: [{ role: 'user', text: 'Đây là gì?', image }] });

    const [, user] = server.requests[0]?.body['messages'] as { content: { type: string; text?: string; image_url?: { url: string } }[] }[];
    expect(user?.content[0]).toEqual({ type: 'text', text: 'Đây là gì?' });
    expect(user?.content[1]?.image_url?.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('turns a text answer into text', async () => {
    const server = await startServer(makeCompletionReply('Chào anh'));

    const result = await makeChat(server).respond(REQUEST);

    expect(result).toEqual({ ok: true, reply: { kind: 'text', text: 'Chào anh' } });
  });

  it('turns a slow answer into a timeout', async () => {
    const server = await startServer({ ...TEXT_REPLY, delayMs: 500 });

    const result = await makeChat(server, { timeoutMs: 100 }).respond(REQUEST);

    expect(result).toEqual({ ok: false, reason: 'timeout' });
  });

  it('turns a server error into unavailable', async () => {
    const server = await startServer({ status: 500, body: { error: { message: 'boom' } } });

    const result = await makeChat(server).respond(REQUEST);

    expect(result).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('turns an authentication error into unavailable', async () => {
    const server = await startServer({ status: 401, body: { error: { message: 'bad key' } } });

    const result = await makeChat(server).respond(REQUEST);

    expect(result).toEqual({ ok: false, reason: 'unavailable' });
  });
});
