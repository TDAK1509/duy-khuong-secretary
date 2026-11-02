import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { pingDatabase } from '../app/db/ping-database.ts';
import { handleHealth } from '../app/http/health.ts';
import type { HttpResponse } from '../app/http/http-response.ts';
import {
  handleZaloOAuthCallback,
  type OAuthCallbackDependencies,
  type OAuthCallbackQuery,
} from '../app/http/zalo-oauth-callback.ts';
import type { PostgresPool } from '../providers/database/postgres.ts';

export type ServerOptions = {
  oauthCallback?: OAuthCallbackDependencies;
};

export function buildServer(pool: PostgresPool, commit: string | null, options: ServerOptions = {}): FastifyInstance {
  const server = Fastify();
  server.get('/health', async (_request, reply) => {
    const response = await handleHealth(() => pingDatabase(pool), commit);
    return sendResponse(reply, response);
  });
  const { oauthCallback } = options;
  if (oauthCallback) {
    server.get('/oauth/zalo/callback', async (request, reply) =>
      sendResponse(reply, await handleZaloOAuthCallback(oauthCallback, request.query as OAuthCallbackQuery)),
    );
  }
  return server;
}

function sendResponse(reply: FastifyReply, response: HttpResponse): FastifyReply {
  return reply.status(response.status).headers(response.headers).send(response.body);
}
