import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type StubRequest = {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
};

export type StubAnswer =
  | { kind: 'reply'; status: number; body: string }
  | { kind: 'silence' };

export type StubHttpServer = {
  baseUrl: string;
  requests: StubRequest[];
  close(): Promise<void>;
};

export function replyWithJson(body: unknown, status = 200): StubAnswer {
  return { kind: 'reply', status, body: JSON.stringify(body) };
}

export const staySilent: StubAnswer = { kind: 'silence' };

export async function startStubHttpServer(answer: StubAnswer): Promise<StubHttpServer> {
  const requests: StubRequest[] = [];
  const server = createServer((request, response) => {
    void collectBody(request).then((body) => {
      requests.push({ method: request.method ?? '', path: request.url ?? '', headers: request.headers, body });
      if (answer.kind === 'silence') return;
      response.writeHead(answer.status, { 'content-type': 'application/json' });
      response.end(answer.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, requests, close: () => closeServer(server) };
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
