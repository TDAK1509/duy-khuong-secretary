import { describe, expect, it } from 'vitest';
import { ADMIN_TEXT_TOOLS, AdminTextGuard, CHANGE_TOOLS } from '../../../src/app/admin-chat/tools/admin-text-guard.ts';

describe('the admin text guard and the member fact tools', () => {
  it('lists the list tool as admin text and the other three as changes', () => {
    expect(ADMIN_TEXT_TOOLS).toContain('list_member_facts');
    expect(CHANGE_TOOLS).toEqual(expect.arrayContaining(['add_member_fact', 'forget_member_fact', 'forget_all_member_facts']));
  });
});
