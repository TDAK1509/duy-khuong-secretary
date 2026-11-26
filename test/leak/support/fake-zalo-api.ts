import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type FakeZaloApi = { baseUrl: string; close(): Promise<void> };

export async function startFakeZaloApi(answers: { upload: object; send: object }): Promise<FakeZaloApi> {
  const server = createServer((request, response) => {
    const answer = request.url?.includes('/upload/') ? answers.upload : answers.send;
    request.resume();
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(answer));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => closeServer(server) };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
