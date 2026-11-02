import { randomInt } from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
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
