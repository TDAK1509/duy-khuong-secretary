import { randomInt } from 'node:crypto';
import { toAccentFreeForm } from '../reading/normalize.ts';
import { hashSecretToken } from './secret-token.ts';
import { CODE_ALPHABET } from '../workspaces/invite-code.ts';

const GROUP_LENGTH = 4;
const LOGIN_COMMAND = 'dang nhap';

export function isLoginCommand(text: string): boolean {
  return toAccentFreeForm(text) === LOGIN_COMMAND;
}

export function generateLoginCode(): string {
  const characters = Array.from({ length: GROUP_LENGTH * 2 }, () => CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length)));
  return `${characters.slice(0, GROUP_LENGTH).join('')}-${characters.slice(GROUP_LENGTH).join('')}`;
}

export function normalizeLoginCode(text: string): string {
  return text.trim().toUpperCase().replaceAll(/[ -]/g, '');
}

export function hashLoginCode(code: string): string {
  return hashSecretToken(normalizeLoginCode(code));
}
