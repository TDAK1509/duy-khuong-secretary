import { describe, expect, it } from 'vitest';
import { generateInviteCode, normalizeInviteCode } from '../../src/app/workspaces/invite-code.ts';

describe('generateInviteCode', () => {
  it('gives a code in the invite format', () => {
    expect(generateInviteCode()).toMatch(/^MOI-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });
});

describe('normalizeInviteCode', () => {
  it('turns a code typed in lowercase with spaces into the stored form', () => {
    expect(normalizeInviteCode(' moi 7k4p 9x ')).toBe('MOI7K4P9X');
  });
});
