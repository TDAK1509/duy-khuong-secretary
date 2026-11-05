import { createHash, randomBytes } from 'node:crypto';

const SECRET_TOKEN_BYTES = 32;

export function generateSecretToken(): string {
  return randomBytes(SECRET_TOKEN_BYTES).toString('base64url');
}

export function hashSecretToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
