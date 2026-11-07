import { describe, expect, it } from 'vitest';
import { runToolLoop, type LoggedRound } from '../../../src/app/admin-chat/run-tool-loop.ts';
import type { ChatRequest, ToolCall } from '../../../src/services/chat/chat-service.ts';
import { FakeChatService, replyWithText, replyWithToolCalls } from '../../fakes/fake-chat-service.ts';

const REQUEST: ChatRequest = { system: 'prompt', turns: [{ role: 'user', text: 'Chào' }], tools: [] };
const SEARCH_CALL: ToolCall = { id: 'call_1', name: 'search_records', argumentsJson: '{}' };

describe('the tool loop', () => {
  it('answers a text reply without tools', async () => {
    const chat = new FakeChatService();
    chat.replyWith('Chào anh');

    const result = await runToolLoop(chat, REQUEST, async () => '{}');

    expect(result).toEqual({ outcome: 'answered', text: 'Chào anh' });
  });

  it('records the result count of a search round before the text answer', async () => {
    const chat = new FakeChatService();
    chat.follow((_request, callNumber) => (callNumber === 1 ? replyWithToolCalls(SEARCH_CALL) : replyWithText('Có 2 mục')));
    const rounds: LoggedRound[] = [];

    const result = await runToolLoop(chat, REQUEST, async () => '{"items":[{},{}],"next_cursor":null}', rounds);

    expect(result.outcome).toBe('answered');
    expect(rounds).toEqual([{ ran: true, calls: [{ tool: 'search_records', arguments: '', result: '2' }] }]);
  });

  it('stops at the round limit and logs the sixth requested round as not run', async () => {
    const chat = new FakeChatService();
    chat.follow(() => replyWithToolCalls(SEARCH_CALL));
    const rounds: LoggedRound[] = [];

    const result = await runToolLoop(chat, REQUEST, async () => '{"items":[{}],"next_cursor":null}', rounds);

    const ranCall = { tool: 'search_records', arguments: '', result: '1' };
    const notRunCall = { tool: 'search_records', arguments: '', result: 'not_run' };
    expect(result.outcome).toBe('tool_round_limit');
    expect(rounds).toEqual([
      ...Array(5).fill({ ran: true, calls: [ranCall] }),
      { ran: false, calls: [notRunCall] },
    ]);
  });

  it('logs the sixth call of one round as not run', async () => {
    const calls = Array.from({ length: 6 }, (_, index) => ({ ...SEARCH_CALL, id: `call_${index}` }));
    const chat = new FakeChatService();
    chat.follow((_request, callNumber) => (callNumber === 1 ? replyWithToolCalls(...calls) : replyWithText('Xong')));
    const rounds: LoggedRound[] = [];

    await runToolLoop(chat, REQUEST, async () => '{"items":[{}],"next_cursor":null}', rounds);

    expect(rounds[0]?.calls.map((call) => call.result)).toEqual(['1', '1', '1', '1', '1', 'not_run']);
  });

  it('fails the chat when the first request fails and runs no round', async () => {
    const chat = new FakeChatService();
    chat.failWith('timeout');
    const rounds: LoggedRound[] = [];

    const result = await runToolLoop(chat, REQUEST, async () => '{}', rounds);

    expect(result.outcome).toBe('chat_failed');
    expect(rounds).toEqual([]);
  });
});
