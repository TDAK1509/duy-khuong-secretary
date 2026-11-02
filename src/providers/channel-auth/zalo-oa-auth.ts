import { z } from 'zod';
import type { ChannelAuth, AuthResult } from '../../services/channel-auth/channel-auth.ts';
import type { Clock } from '../../services/clock/clock.ts';

const REFRESH_KEY_VALID_FOR_MS = 90 * 24 * 60 * 60 * 1000;

const tokenAnswerSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.coerce.number(),
});

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
    const response = await this.postForm({
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: 'authorization_code',
    });
    return this.readTokens(await response.json());
  }

  private readTokens(answer: unknown): AuthResult {
    const { access_token, refresh_token, expires_in } = tokenAnswerSchema.parse(answer);
    const now = this.settings.clock.now().getTime();
    return {
      ok: true,
      tokens: {
        accessToken: access_token,
        refreshToken: refresh_token,
        accessExpiresAt: new Date(now + expires_in * 1000),
        refreshExpiresAt: new Date(now + REFRESH_KEY_VALID_FOR_MS),
      },
    };
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
