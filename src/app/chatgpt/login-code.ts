import { randomInt } from 'node:crypto';
import { toAccentFreeForm } from '../reading/normalize.ts';
import { hashSecretToken } from './secret-token.ts';
import { CODE_ALPHABET } from '../workspaces/invite-code.ts';

const GROUP_LENGTH = 4;
const LOGIN_CODE_LENGTH = GROUP_LENGTH * 2;
const LOGIN_COMMAND = 'dang nhap';

export function isLoginCommand(text: string): boolean {
  return toAccentFreeForm(text) === LOGIN_COMMAND;
}

export function generateLoginCode(): string {
  const characters = Array.from({ length: LOGIN_CODE_LENGTH }, () => CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length)));
  return `${characters.slice(0, GROUP_LENGTH).join('')}-${characters.slice(GROUP_LENGTH).join('')}`;
}

export function normalizeLoginCode(text: string): string {
  return text.toUpperCase().replaceAll(/[\s\p{Dash}]/gu, '');
}

export function hashLoginCode(code: string): string {
  return hashSecretToken(normalizeLoginCode(code));
}

export function isLoginCodeShape(text: string): boolean {
  const code = normalizeLoginCode(text);
  return code.length === LOGIN_CODE_LENGTH && [...code].every((character) => CODE_ALPHABET.includes(character));
}
