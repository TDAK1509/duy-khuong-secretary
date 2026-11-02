import type { ChannelAuth } from '../../services/channel-auth/channel-auth.ts';
import { createPkcePair, sealConnectState } from './connect-state.ts';

const CALLBACK_PATH = '/oauth/zalo/callback';

export type ConnectionStart = {
  channelAuth: ChannelAuth;
  publicBaseUrl: string;
  encryptionKey: string;
  now: Date;
};

export function buildAuthorizationLink(start: ConnectionStart): string {
  const pkce = createPkcePair();
  return start.channelAuth.authorizationUrl({
    state: sealConnectState(pkce.verifier, start.now, start.encryptionKey),
    codeChallenge: pkce.challenge,
    redirectUri: new URL(CALLBACK_PATH, start.publicBaseUrl).toString(),
  });
}
