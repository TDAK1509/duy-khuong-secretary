import { randomInt } from 'node:crypto';
import { CODE_ALPHABET } from '../workspaces/invite-code.ts';
import { hashSecretToken } from './secret-token.ts';

const GROUP_LENGTH = 4;
const LOGIN_CODE_LENGTH = GROUP_LENGTH * 2;

export function generateLoginCode(): string {
  const characters = Array.from({ length: LOGIN_CODE_LENGTH }, () => CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length)));
  return `${characters.slice(0, GROUP_LENGTH).join('')}-${characters.slice(GROUP_LENGTH).join('')}`;
}

function normalizeLoginCode(text: string): string {
  return text.toUpperCase().replaceAll(/[\s\p{Dash}]/gu, '');
}

export function hashLoginCode(code: string): string {
  return hashSecretToken(normalizeLoginCode(code));
}
