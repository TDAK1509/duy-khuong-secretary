import { createHash, randomInt } from 'node:crypto';

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export function generateInviteCode(): string {
  const characters = Array.from({ length: CODE_LENGTH }, () =>
    CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length)),
  );
  return `MOI-${characters.join('')}`;
}

export function normalizeInviteCode(text: string): string {
  return text.trim().toUpperCase().replaceAll(/[ -]/g, '');
}

export function isInviteCodeMessage(text: string): boolean {
  return /^MOI.{6}$/s.test(normalizeInviteCode(text));
}

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(normalizeInviteCode(code)).digest('hex');
}
