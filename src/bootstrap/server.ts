import type { IncomingHttpHeaders } from 'node:http';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { pingDatabase } from '../app/db/ping-database.ts';
import { handleHealth } from '../app/http/health.ts';
import { respondWithHtml, type HttpResponse } from '../app/http/http-response.ts';
import {
  handleZaloOAuthCallback,
  type OAuthCallbackDependencies,
  type OAuthCallbackQuery,
} from '../app/http/zalo-oauth-callback.ts';
import { handleSignInPage, type SignInDependencies, type SignInQuery } from '../app/http/chatgpt-sign-in.ts';
import { handleZaloWebhook, type ZaloWebhookDependencies } from '../app/http/zalo-webhook.ts';
import type { VerifierFile } from './config.ts';
import type { PostgresPool } from '../providers/database/postgres.ts';

const WEBHOOK_BODY_LIMIT_BYTES = 1024 * 1024;

export type ServerOptions = {
  oauthCallback?: OAuthCallbackDependencies | null;
  webhook?: ZaloWebhookDependencies | null;
  verifierFile?: VerifierFile | null;
  signIn?: SignInDependencies | null;
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
  registerZaloWebhookRoute(server, options.webhook ?? null);
  registerSignInRoutes(server, options.signIn ?? null);
  const { verifierFile } = options;
  if (verifierFile) {
    server.get(`/${verifierFile.fileName}`, async (_request, reply) =>
      sendResponse(reply, respondWithHtml(verifierFile.content)),
    );
  }
}

function registerSignInRoutes(server: FastifyInstance, signIn: SignInDependencies | null): void {
  server.get('/oauth/authorize', async (request, reply) =>
    sendResponse(reply, await handleSignInPage(signIn, request.query as SignInQuery)),
  );
}

function registerZaloWebhookRoute(server: FastifyInstance, webhook: ZaloWebhookDependencies | null): void {
  void server.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: WEBHOOK_BODY_LIMIT_BYTES }, (_request, body, done) => done(null, body));
    scope.post('/webhooks/zalo', async (request, reply) => {
      const rawBody = Buffer.isBuffer(request.body) ? request.body.toString('utf8') : '';
      const response = await handleZaloWebhook(webhook, { rawBody, headers: readHeaders(request.headers) });
      return sendResponse(reply, response);
    });
  });
}

function readHeaders(headers: IncomingHttpHeaders): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, readHeaderValue(value)]));
}

function readHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(', ') : value;
}

function sendResponse(reply: FastifyReply, response: HttpResponse): FastifyReply {
  return reply.status(response.status).headers(response.headers).send(response.body);
}
