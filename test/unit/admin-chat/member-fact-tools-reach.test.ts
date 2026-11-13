import { describe, expect, it } from 'vitest';
import { SCHEDULED_RUN_TOOLS } from '../../../src/app/scheduled-runs/scheduled-tools.ts';
import { listChatTools } from '../../../src/app/admin-chat/tools/chat-tools.ts';

const MEMBER_FACT_TOOL_NAMES = ['list_member_facts', 'add_member_fact', 'forget_member_fact', 'forget_all_member_facts'];

describe('the member fact tools outside the admin chat', () => {
  it('stay out of the chat tool list of a member', () => {
    const names = listChatTools('member').map((tool) => tool.name);

    for (const toolName of MEMBER_FACT_TOOL_NAMES) expect(names).not.toContain(toolName);
  });

  it('stay out of the scheduled tool list', () => {
    const names = SCHEDULED_RUN_TOOLS.map((tool) => tool.name);

    for (const toolName of MEMBER_FACT_TOOL_NAMES) expect(names).not.toContain(toolName);
  });
});
