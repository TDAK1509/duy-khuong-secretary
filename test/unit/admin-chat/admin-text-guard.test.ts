import { describe, expect, it } from 'vitest';
import { ADMIN_TOOLS } from '../../../src/app/admin-chat/tools/admin-tools.ts';
import { ADMIN_TEXT_TOOLS, AdminTextGuard, CHANGE_TOOLS, MEMBER_TEXT_TOOLS } from '../../../src/app/admin-chat/tools/admin-text-guard.ts';

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

describe('the admin text guard', () => {
  it('allows a change while no other text was seen', () => {
    const guard = new AdminTextGuard(false);

    expect(guard.refuses('remove_member')).toBe(false);
  });

  it.each(CHANGE_TOOLS)('refuses %s after a search', (changeTool) => {
    const guard = new AdminTextGuard(false);
    guard.noteCall('search_records');

    expect(guard.refuses(changeTool)).toBe(true);
  });

  it('refuses a change after the maintenance status', () => {
    const guard = new AdminTextGuard(false);
    guard.noteCall('maintenance_status');

    expect(guard.refuses('create_invite')).toBe(true);
  });

  it('refuses a change when the turn starts with other text', () => {
    const guard = new AdminTextGuard(true);

    expect(guard.refuses('cancel_scheduled_task')).toBe(true);
  });

  it('keeps allowing a change after tools that return only admin text', () => {
    const guard = new AdminTextGuard(false);
    for (const toolName of [...ADMIN_TEXT_TOOLS, 'create_invite']) guard.noteCall(toolName);

    expect(guard.refuses('remove_member')).toBe(false);
  });
});
