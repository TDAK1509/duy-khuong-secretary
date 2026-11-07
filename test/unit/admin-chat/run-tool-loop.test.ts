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
});
