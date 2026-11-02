export const MAX_DISPLAY_NAME_LENGTH = 60;
export const INVITE_VALID_FOR_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
const UNIQUE_VIOLATION = '23505';
const CODE_HASH_CONSTRAINT = 'workspace_invites_code_hash_key';

export function isTakenCodeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === UNIQUE_VIOLATION &&
    'constraint' in error &&
    error.constraint === CODE_HASH_CONSTRAINT
  );
}

export function hasLengthBetween(name: string, maxLength: number): boolean {
  const length = [...name].length;
  return length >= 1 && length <= maxLength;
}
