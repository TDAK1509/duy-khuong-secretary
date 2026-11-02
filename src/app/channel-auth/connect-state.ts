import { createHash, randomBytes } from 'node:crypto';
import { decryptToken, encryptToken } from './token-cipher.ts';

const STATE_VALID_FOR_MS = 30 * 60 * 1000;

export type PkcePair = { verifier: string; challenge: string };

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function sealConnectState(verifier: string, now: Date, encryptionKey: string): string {
  const expiresAt = now.getTime() + STATE_VALID_FOR_MS;
  const encrypted = encryptToken(JSON.stringify({ verifier, expiresAt }), encryptionKey);
  return Buffer.from(encrypted, 'base64').toString('base64url');
}

export function openConnectState(state: string, encryptionKey: string): string | null {
  try {
    const encrypted = Buffer.from(state, 'base64url').toString('base64');
    const { verifier } = JSON.parse(decryptToken(encrypted, encryptionKey)) as { verifier: string };
    return verifier;
  } catch {
    return null;
  }
}
