import type { AuthResult, ChannelAuth, TokenPair } from '../../src/services/channel-auth/channel-auth.ts';

export type ExchangeCall = { code: string; codeVerifier: string };

export function makeTokenPair(overrides: Partial<TokenPair> = {}): TokenPair {
  return {
    accessToken: 'a1',
    refreshToken: 'r1',
    accessExpiresAt: new Date('2026-11-03T11:00:00+07:00'),
    refreshExpiresAt: new Date('2027-01-31T10:00:00+07:00'),
    ...overrides,
  };
}

export class FakeChannelAuth implements ChannelAuth {
  readonly exchanges: ExchangeCall[] = [];
  readonly refreshes: string[] = [];
  exchangeResult: AuthResult = { ok: true, tokens: makeTokenPair() };
  refreshResult: AuthResult = { ok: true, tokens: makeTokenPair() };
  refreshDelayMs = 0;

  authorizationUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string {
    const url = new URL('https://fake-zalo.test/v4/oa/permission');
    url.searchParams.set('state', input.state);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('redirect_uri', input.redirectUri);
    return url.toString();
  }

  async exchangeAuthorization(input: ExchangeCall): Promise<AuthResult> {
    this.exchanges.push(input);
    return this.exchangeResult;
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    this.refreshes.push(refreshToken);
    if (this.refreshDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.refreshDelayMs));
    return this.refreshResult;
  }
}
