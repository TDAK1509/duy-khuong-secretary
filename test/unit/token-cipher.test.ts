import { describe, expect, it } from 'vitest';
import { decryptToken, encryptToken } from '../../src/app/channel-auth/token-cipher.ts';

const KEY_A = 'a'.repeat(64);

describe('token cipher', () => {
  it('decrypts an encrypted key to the original', () => {
    expect(decryptToken(encryptToken('secret-token', KEY_A), KEY_A)).toBe('secret-token');
  });

  it('does not contain the plain key in the stored text', () => {
    const stored = encryptToken('secret-token', KEY_A);

    expect(stored).not.toContain('secret-token');
    expect(Buffer.from(stored, 'base64').toString('utf8')).not.toContain('secret-token');
  });

  it('fails to decrypt with another key', () => {
    const stored = encryptToken('secret-token', KEY_A);

    expect(() => decryptToken(stored, 'b'.repeat(64))).toThrow();
  });
});
