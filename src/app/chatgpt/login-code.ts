import { randomInt } from 'node:crypto';
import { hashSecretToken } from './secret-token.ts';
import { CODE_ALPHABET } from '../workspaces/invite-code.ts';

const GROUP_LENGTH = 4;
const LOGIN_COMMAND = 'đăng nhập';

export function isLoginCommand(text: string): boolean {
  return text.trim() === LOGIN_COMMAND;
}

export function generateLoginCode(): string {
  const characters = Array.from({ length: GROUP_LENGTH * 2 }, () => CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length)));
  return `${characters.slice(0, GROUP_LENGTH).join('')}-${characters.slice(GROUP_LENGTH).join('')}`;
}

export function hashLoginCode(code: string): string {
  return hashSecretToken(code.replaceAll('-', ''));
}
