import Fastify, { type FastifyInstance } from 'fastify';
import { pingDatabase } from '../app/db/ping-database.ts';
import { handleHealth } from '../app/http/health.ts';
import type { PostgresPool } from '../providers/database/postgres.ts';

export function buildServer(pool: PostgresPool): FastifyInstance {
  const server = Fastify();
  server.get('/health', async (_request, reply) => {
    const response = await handleHealth(() => pingDatabase(pool));
    return reply.status(response.status).headers(response.headers).send(response.body);
  });
  return server;
}
