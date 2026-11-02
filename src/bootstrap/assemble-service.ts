import type { FastifyInstance } from 'fastify';
import { OperatorAlerts } from '../app/alerts/operator-alerts.ts';
import { runTick } from '../app/ticker/run-tick.ts';
import type { Clock } from '../services/clock/clock.ts';
import { createPostgresPool, type PostgresPool } from '../providers/database/postgres.ts';
import { loadConfig, type Config } from './config.ts';
import { buildAlertSink, buildChannelAuth, buildClock } from './from-env.ts';
import { buildServer } from './server.ts';
import { loadZaloConfig, type ZaloConfig } from './zalo-config.ts';

export type Service = {
  config: Config;
  server: FastifyInstance;
  pool: PostgresPool;
  runTick: () => Promise<void>;
};

export function assembleService(environment: NodeJS.ProcessEnv, log: (line: string) => void = console.log): Service {
  const config = loadConfig(environment);
  const zalo = readZaloConfig(environment, log);
  const pool = createPostgresPool(config.databaseUrl);
  const clock = buildClock();
  const alerts = new OperatorAlerts(buildAlertSink(config.alert), clock);
  const connection = zalo && buildConnectionDependencies(zalo, pool, clock);
  const server = buildServer(pool, config.commit, {
    oauthCallback: connection,
    verifierFile: config.verifierFile,
  });
  const renewal = connection && { ...connection, alerts };
  return { config, server, pool, runTick: () => runTick({ renewal }) };
}

function buildConnectionDependencies(zalo: ZaloConfig, pool: PostgresPool, clock: Clock) {
  return { database: pool, channelAuth: buildChannelAuth(zalo, clock), encryptionKey: zalo.encryptionKey, clock };
}

function readZaloConfig(environment: NodeJS.ProcessEnv, log: (line: string) => void): ZaloConfig | null {
  const result = loadZaloConfig(environment);
  if (result.ok) return result.config;
  log(`[config] zalo is off; missing: ${result.missing.join(', ')}.`);
  return null;
}
