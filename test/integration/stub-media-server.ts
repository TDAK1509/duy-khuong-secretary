import { execFileSync } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';

export type StubMediaServer = {
  port: number;
  certificate: string;
  requestedPaths: string[];
  close(): Promise<void>;
};

export type MediaHandler = (request: IncomingMessage, response: ServerResponse) => void;

export function serveBytes(bytes: Uint8Array): MediaHandler {
  return (_request, response) => {
    response.writeHead(200, { 'content-type': 'image/jpeg' });
    response.end(bytes);
  };
}

export async function startStubMediaServer(handler: MediaHandler): Promise<StubMediaServer> {
  const { key, certificate } = generateSelfSignedCertificate();
  const requestedPaths: string[] = [];
  const server = createServer({ key, cert: certificate }, (request, response) => {
    requestedPaths.push(request.url ?? '');
    handler(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { port, certificate, requestedPaths, close: () => closeServer(server) };
}

function generateSelfSignedCertificate(): { key: string; certificate: string } {
  const request = 'req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 1';
  const names = "-subj /CN=photo.zdn.vn -addext subjectAltName=DNS:photo.zdn.vn,DNS:photo.zadn.vn";
  const pem = execFileSync('sh', ['-c', `openssl ${request} ${names} -keyout /dev/stdout -out /dev/stdout | cat`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return { key: pickPemBlock(pem, 'PRIVATE KEY'), certificate: pickPemBlock(pem, 'CERTIFICATE') };
}

function pickPemBlock(pem: string, label: string): string {
  const block = pem.match(new RegExp(`-----BEGIN ${label}-----[\\s\\S]+?-----END ${label}-----`));
  if (!block) throw new Error(`openssl printed no ${label}`);
  return block[0];
}

function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}
