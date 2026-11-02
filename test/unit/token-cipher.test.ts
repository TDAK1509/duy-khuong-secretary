import { describe, expect, it } from 'vitest';
import { decryptToken, encryptToken } from '../../src/app/channel-auth/token-cipher.ts';

const KEY_A = 'a'.repeat(64);

describe('token cipher', () => {
  it('decrypts an encrypted key to the original', () => {
    expect(decryptToken(encryptToken('secret-token', KEY_A), KEY_A)).toBe('secret-token');
  });
});
