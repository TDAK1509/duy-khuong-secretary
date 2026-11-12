import { describe, expect, it } from 'vitest';
import { ADMIN_TOOLS } from '../../../src/app/admin-chat/tools/admin-tools.ts';
import { listChatTools } from '../../../src/app/admin-chat/tools/chat-tools.ts';
import { ADMIN_TEXT_TOOLS, AdminTextGuard, CHANGE_TOOLS, MEMBER_TEXT_TOOLS } from '../../../src/app/admin-chat/tools/admin-text-guard.ts';

describe('the kinds of admin tool', () => {
  it('puts every admin tool in exactly one kind', () => {
    const groups = [CHANGE_TOOLS, MEMBER_TEXT_TOOLS, ADMIN_TEXT_TOOLS];

    const adminChatTools = listChatTools('admin');

    for (const tool of adminChatTools) {
      expect(groups.filter((group) => group.includes(tool.name))).toHaveLength(1);
    }
    expect(groups.flat().sort()).toEqual(adminChatTools.map((tool) => tool.name).sort());
  });

  it('names the tools of each kind', () => {
    expect(CHANGE_TOOLS).toEqual(['create_scheduled_task', 'cancel_scheduled_task', 'create_invite', 'remove_member', 'remember', 'forget', 'forget_all']);
    expect(MEMBER_TEXT_TOOLS).toEqual(['search_records', 'maintenance_status', 'list_document_numbers', 'total_document_numbers', 'list_organizations', 'list_sources', 'list_documents']);
    expect(ADMIN_TEXT_TOOLS).toEqual(['count_records', 'list_members', 'list_scheduled_tasks', 'attach_photos']);
  });
});

describe('the removed number tools', () => {
  it.each(['total_numbers', 'list_number_labels'])('is named by no kind and no admin tool: %s', (removedTool) => {
    expect(MEMBER_TEXT_TOOLS).not.toContain(removedTool);
    expect(ADMIN_TOOLS.map((tool) => tool.name)).not.toContain(removedTool);
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

  it('refuses a change after a document total', () => {
    const guard = new AdminTextGuard(false);
    guard.noteCall('total_document_numbers');

    expect(guard.refuses('remove_member')).toBe(true);
  });

  it('refuses a change after the list of document numbers', () => {
    const guard = new AdminTextGuard(false);
    guard.noteCall('list_document_numbers');

    expect(guard.refuses('create_invite')).toBe(true);
  });

  it('refuses a change after the list of organizations', () => {
    const guard = new AdminTextGuard(false);
    guard.noteCall('list_organizations');

    expect(guard.refuses('cancel_scheduled_task')).toBe(true);
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

  it.each([...MEMBER_TEXT_TOOLS, ...ADMIN_TEXT_TOOLS])('never refuses the read tool %s', (readTool) => {
    const guard = new AdminTextGuard(true);

    expect(guard.refuses(readTool)).toBe(false);
  });

  it('reports a refusal only after it refused a change', () => {
    const guardWithOtherText = new AdminTextGuard(true);
    const guardWithoutOtherText = new AdminTextGuard(false);
    const before = [guardWithOtherText.hasRefused(), guardWithoutOtherText.hasRefused()];

    guardWithOtherText.refuses('remove_member');
    guardWithoutOtherText.refuses('remove_member');

    expect(before).toEqual([false, false]);
    expect([guardWithOtherText.hasRefused(), guardWithoutOtherText.hasRefused()]).toEqual([true, false]);
  });
});
