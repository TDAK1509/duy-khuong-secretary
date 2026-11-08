import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type RecordedRequest = { path: string; body: Record<string, unknown> };

export type StubReply = { status: number; body: unknown; delayMs?: number };

export type StubChatServer = {
  baseUrl: string;
  requests: RecordedRequest[];
  close(): Promise<void>;
};

export function makeCompletionReply(content: string, usage?: unknown): StubReply {
  const message = { role: 'assistant', content };
  const choice = { index: 0, finish_reason: 'stop', message };
  return { status: 200, body: { id: 'chatcmpl-1', object: 'chat.completion', created: 0, model: 'stub', choices: [choice], usage } };
}

export function makeToolCallReply(calls: { id: string; name: string; arguments: string }[]): StubReply {
  const toolCalls = calls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } }));
  const message = { role: 'assistant', content: null, tool_calls: toolCalls };
  const choice = { index: 0, finish_reason: 'tool_calls', message };
  return { status: 200, body: { id: 'chatcmpl-1', object: 'chat.completion', created: 0, model: 'stub', choices: [choice] } };
}

export async function startStubChatServer(reply: StubReply): Promise<StubChatServer> {
  const requests: RecordedRequest[] = [];
  const server = createServer((request, response) => {
    void collectBody(request).then(async (rawBody) => {
      requests.push({ path: request.url ?? '', body: JSON.parse(rawBody) as Record<string, unknown> });
      if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
      response.writeHead(reply.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}/v1`, requests, close: () => closeServer(server) };
}

async function collectBody(request: AsyncIterable<Buffer>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}
