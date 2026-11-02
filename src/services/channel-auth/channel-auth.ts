export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

export type AuthResult =
  | { ok: true; tokens: TokenPair }
  | { ok: false; reason: 'rejected' | 'unavailable' | 'no_answer' };

export interface ChannelAuth {
  authorizationUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string;
  exchangeAuthorization(input: { code: string; codeVerifier: string }): Promise<AuthResult>;
  refresh(refreshToken: string): Promise<AuthResult>;
}
