import { describe, expect, it } from 'vitest';
import { generateInviteCode } from '../../src/app/workspaces/invite-code.ts';

describe('generateInviteCode', () => {
  it('gives a code in the invite format', () => {
    expect(generateInviteCode()).toMatch(/^MOI-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });
});
