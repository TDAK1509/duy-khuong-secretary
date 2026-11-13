import { timingSafeEqual } from 'node:crypto';
import { hashSecretToken } from '../chatgpt/secret-token.ts';

export function makeCsrfToken(sessionToken: string): string {
  return hashSecretToken(`csrf:${sessionToken}`);
}

export function isValidCsrfToken(sessionToken: string, submittedToken: string): boolean {
  const expected = Buffer.from(makeCsrfToken(sessionToken));
  const submitted = Buffer.from(submittedToken);
  return expected.length === submitted.length && timingSafeEqual(expected, submitted);
}
