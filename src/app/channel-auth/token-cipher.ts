import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function encryptToken(plainText: string, keyHex: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(keyHex, 'hex'), iv);
  const cipherText = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), cipherText]).toString('base64');
}

export function decryptToken(stored: string, keyHex: string): string {
  const bytes = Buffer.from(stored, 'base64');
  const decipher = createDecipheriv(ALGORITHM, Buffer.from(keyHex, 'hex'), bytes.subarray(0, IV_BYTES));
  decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
}
