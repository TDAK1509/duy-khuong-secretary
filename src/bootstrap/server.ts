import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { pingDatabase } from '../app/db/ping-database.ts';
import { handleHealth } from '../app/http/health.ts';
import { respondWithHtml, type HttpResponse } from '../app/http/http-response.ts';
import {
  handleZaloOAuthCallback,
  type OAuthCallbackDependencies,
  type OAuthCallbackQuery,
} from '../app/http/zalo-oauth-callback.ts';
import type { VerifierFile } from './config.ts';
import type { PostgresPool } from '../providers/database/postgres.ts';

export type ServerOptions = {
  oauthCallback?: OAuthCallbackDependencies | null;
  verifierFile?: VerifierFile | null;
};

export function buildServer(pool: PostgresPool, commit: string | null, options: ServerOptions = {}): FastifyInstance {
  const server = Fastify();
  server.get('/health', async (_request, reply) => {
    const response = await handleHealth(() => pingDatabase(pool), commit);
    return sendResponse(reply, response);
  });
  registerZaloRoutes(server, options);
  return server;
}

function registerZaloRoutes(server: FastifyInstance, options: ServerOptions): void {
  const oauthCallback = options.oauthCallback ?? null;
  server.get('/oauth/zalo/callback', async (request, reply) =>
    sendResponse(reply, await handleZaloOAuthCallback(oauthCallback, request.query as OAuthCallbackQuery)),
  );
  const { verifierFile } = options;
  if (verifierFile) {
    server.get(`/${verifierFile.fileName}`, async (_request, reply) =>
      sendResponse(reply, respondWithHtml(verifierFile.content)),
    );
  }
}

function sendResponse(reply: FastifyReply, response: HttpResponse): FastifyReply {
  return reply.status(response.status).headers(response.headers).send(response.body);
}
