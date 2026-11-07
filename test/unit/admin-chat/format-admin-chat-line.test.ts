import { describe, expect, it } from 'vitest';
import { formatAdminChatLine } from '../../../src/app/admin-chat/format-admin-chat-line.ts';

describe('the admin-chat line', () => {
  it('shows a dash for an answer without tool calls', () => {
    expect(formatAdminChatLine('m1', 'answered', [])).toBe('[admin-chat] message=m1 outcome=answered rounds=0 calls=-');
  });

  it('joins the calls of a round with a comma and the rounds with a slash', () => {
    const search = { tool: 'search_records', arguments: 'text', result: '50' };
    const count = { tool: 'count_records', arguments: '', result: 'error' };

    const line = formatAdminChatLine('m1', 'answered', [
      { ran: true, calls: [search, count] },
      { ran: true, calls: [search] },
    ]);

    expect(line).toBe('[admin-chat] message=m1 outcome=answered rounds=2 calls=search_records(text)=50,count_records()=error/search_records(text)=50');
  });

  it('keeps a round that the round limit stopped in the calls but not in the rounds', () => {
    const run = { tool: 'list_members', arguments: '', result: '3' };
    const notRun = { tool: 'list_members', arguments: '', result: 'not_run' };

    const line = formatAdminChatLine('m1', 'tool_round_limit', [
      ...Array(5).fill({ ran: true, calls: [run] }),
      { ran: false, calls: [notRun] },
    ]);

    expect(line).toBe(
      '[admin-chat] message=m1 outcome=tool_round_limit rounds=5 calls=' +
        'list_members()=3/list_members()=3/list_members()=3/list_members()=3/list_members()=3/list_members()=not_run',
    );
  });
});
