import type { ChannelAuth, AuthResult } from '../../services/channel-auth/channel-auth.ts';
import type { Clock } from '../../services/clock/clock.ts';

export type ZaloOaAuthSettings = {
  appId: string;
  appSecret: string;
  oauthBaseUrl: string;
  timeoutMs: number;
  clock: Clock;
};

export class ZaloOaAuth implements ChannelAuth {
  private readonly settings: ZaloOaAuthSettings;

  constructor(settings: ZaloOaAuthSettings) {
    this.settings = settings;
  }

  authorizationUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string {
    const url = new URL('/v4/oa/permission', this.settings.oauthBaseUrl);
    url.searchParams.set('app_id', this.settings.appId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('state', input.state);
    return url.toString();
  }

  async exchangeAuthorization(input: { code: string; codeVerifier: string }): Promise<AuthResult> {
    await this.postForm({
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: 'authorization_code',
    });
    return { ok: false, reason: 'rejected' };
  }

  async refresh(): Promise<AuthResult> {
    throw new Error('not implemented');
  }

  private postForm(fields: Record<string, string>): Promise<Response> {
    return fetch(new URL('/v4/oa/access_token', this.settings.oauthBaseUrl), {
      method: 'POST',
      headers: { secret_key: this.settings.appSecret },
      body: new URLSearchParams({ app_id: this.settings.appId, ...fields }),
      signal: AbortSignal.timeout(this.settings.timeoutMs),
    });
  }
}
