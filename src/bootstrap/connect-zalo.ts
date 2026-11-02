import { buildAuthorizationLink } from '../app/channel-auth/start-connection.ts';
import { buildChannelAuth, buildClock } from './from-env.ts';
import { loadZaloConfig } from './zalo-config.ts';

export type ConnectZaloOptions = { log?: (line: string) => void };

export function runConnectZaloCommand(environment: NodeJS.ProcessEnv, options: ConnectZaloOptions = {}): number {
  const log = options.log ?? console.log;
  const configResult = loadZaloConfig(environment);
  if (!configResult.ok) {
    log(`zalo is not configured: missing ${configResult.missing.join(', ')}.`);
    return 1;
  }
  const clock = buildClock();
  const link = buildAuthorizationLink({
    channelAuth: buildChannelAuth(configResult.config, clock),
    publicBaseUrl: configResult.config.publicBaseUrl,
    encryptionKey: configResult.config.encryptionKey,
    now: clock.now(),
  });
  log('Open this link while logged in to Zalo as an OA admin, then approve:');
  log(link);
  return 0;
}

if (import.meta.main) {
  process.exitCode = runConnectZaloCommand(process.env);
}
