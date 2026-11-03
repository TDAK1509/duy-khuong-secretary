import { describe, expect, it } from 'vitest';
import { ADMIN_TOOLS } from '../../../src/app/admin-chat/tools/admin-tools.ts';
import { ADMIN_TEXT_TOOLS, CHANGE_TOOLS, MEMBER_TEXT_TOOLS } from '../../../src/app/admin-chat/tools/admin-text-guard.ts';

describe('the kinds of admin tool', () => {
  it('puts every admin tool in exactly one kind', () => {
    const groups = [CHANGE_TOOLS, MEMBER_TEXT_TOOLS, ADMIN_TEXT_TOOLS];

    for (const tool of ADMIN_TOOLS) {
      expect(groups.filter((group) => group.includes(tool.name))).toHaveLength(1);
    }
    expect(groups.flat().sort()).toEqual(ADMIN_TOOLS.map((tool) => tool.name).sort());
  });

  it('names the tools of each kind', () => {
    expect(CHANGE_TOOLS).toEqual(['create_scheduled_task', 'cancel_scheduled_task', 'create_invite', 'remove_member']);
    expect(MEMBER_TEXT_TOOLS).toEqual(['search_records', 'maintenance_status']);
    expect(ADMIN_TEXT_TOOLS).toEqual(['count_records', 'list_members', 'list_scheduled_tasks', 'attach_photos']);
  });
});
