import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type StubRequest = {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
  rawBody: Buffer;
};

export type StubAnswer =
  | { kind: 'reply'; status: number; body: string }
  | { kind: 'silence' }
  | { kind: 'endless-body'; status: number };

export type StubHttpServer = {
  baseUrl: string;
  requests: StubRequest[];
  responseClosed: Promise<void>;
  close(): Promise<void>;
};

export function replyWithJson(body: unknown, status = 200): StubAnswer {
  return { kind: 'reply', status, body: JSON.stringify(body) };
}

export function streamEndlessBody(status: number): StubAnswer {
  return { kind: 'endless-body', status };
}

export const staySilent: StubAnswer = { kind: 'silence' };

export type StubAnswerer = StubAnswer | ((request: StubRequest) => StubAnswer);

export async function startStubHttpServer(answerer: StubAnswerer): Promise<StubHttpServer> {
  const requests: StubRequest[] = [];
  let markResponseClosed = () => {};
  const responseClosed = new Promise<void>((resolve) => (markResponseClosed = resolve));
  const server = createServer((request, response) => {
    response.on('close', markResponseClosed);
    void collectBody(request).then((rawBody) => {
      const recorded = {
        method: request.method ?? '',
        path: request.url ?? '',
        headers: request.headers,
        body: rawBody.toString('utf8'),
        rawBody,
      };
      requests.push(recorded);
      const answer = typeof answerer === 'function' ? answerer(recorded) : answerer;
      if (answer.kind === 'silence') return;
      if (answer.kind === 'endless-body') {
        response.writeHead(answer.status, { 'content-type': 'text/plain' });
        response.write('still talking');
        return;
      }
      response.writeHead(answer.status, { 'content-type': 'application/json' });
      response.end(answer.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, requests, responseClosed, close: () => closeServer(server) };
}

async function collectBody(request: AsyncIterable<Buffer>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}
