import { generateSecretToken, hashSecretToken } from './secret-token.ts';

export const ACCESS_TOKEN_VALID_FOR_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_VALID_FOR_MS = 30 * 24 * 60 * 60 * 1000;

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenHash: string;
  accessExpiresAt: Date;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
};

export function issueTokens(now: Date): IssuedTokens {
  const accessToken = generateSecretToken();
  const refreshToken = generateSecretToken();
  return {
    accessToken,
    refreshToken,
    accessTokenHash: hashSecretToken(accessToken),
    accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_VALID_FOR_MS),
    refreshTokenHash: hashSecretToken(refreshToken),
    refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_VALID_FOR_MS),
  };
}
