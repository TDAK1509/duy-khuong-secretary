import { loadConfig } from './config.ts';
import { buildProvidersFromConfig } from './from-env.ts';
import { buildServer } from './server.ts';

const config = loadConfig(process.env);
const { pool } = buildProvidersFromConfig(config);
const server = buildServer(pool);

process.once('SIGTERM', () => void shutDown());

await server.listen({ port: config.port, host: '0.0.0.0' });

async function shutDown(): Promise<void> {
  await server.close();
  await pool.end();
}
