import { describe, expect, it } from 'vitest';
import { ADMIN_TEXT_TOOLS, AdminTextGuard, CHANGE_TOOLS } from '../../../src/app/admin-chat/tools/admin-text-guard.ts';

describe('the admin text guard and the member fact tools', () => {
  it('lists the list tool as admin text and the other three as changes', () => {
    expect(ADMIN_TEXT_TOOLS).toContain('list_member_facts');
    expect(CHANGE_TOOLS).toEqual(expect.arrayContaining(['add_member_fact', 'forget_member_fact', 'forget_all_member_facts']));
  });

  it('allows a remove in the same turn as a list', () => {
    const guard = new AdminTextGuard(false);
    guard.noteCall('list_member_facts');

    expect(guard.refuses('forget_member_fact')).toBe(false);
  });
});
