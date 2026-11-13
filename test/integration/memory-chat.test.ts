import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertUserMemory, readUserMemory } from './user-memory-rows.ts';
import { insertMember } from './workspace-rows.ts';

const SEARCH_EVERYTHING = { text: null, category: null, member: null, plate: null, added_from: null, added_to: null, cursor: null };

const MEMORY_REFUSED_NOTICE = `Có việc tôi chưa làm (đặt lịch, hủy lịch, mời hoặc xóa người, ghi nhớ hoặc quên, tách tên đã gộp, lưu hoặc xóa thông tin về thành viên) vì tin nhắn này đi kèm dữ liệu đọc từ ảnh, hoặc tôi đã đọc dữ liệu do thành viên gửi.
Nếu bạn vẫn muốn, hãy nhắn lại riêng yêu cầu này.`;

describe('the memory of a user in the chat', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    harness.reader.answerWith(makeReading([], { has_work_data: false, has_question: true }));
  });

  afterEach(async () => {
    await harness.close();
  });

  it('puts the memory of the user in the system prompt as a JSON string', async () => {
    await insertUserMemory(harness.database, { workspaceId: harness.workspaceId, userId: harness.hungUserId, markdown: '- Tôi lái xe 29C-123.45' });

    await harness.receiveText('zu-hung', 'Chào bạn');

    expect(harness.chat.requests[0]?.system).toContain('Bản ghi nhớ hiện tại, dưới dạng chuỗi JSON:\n"- Tôi lái xe 29C-123.45"');
  });

  it('puts the memory of another member nowhere in the prompt of a member', async () => {
    await insertUserMemory(harness.database, { workspaceId: harness.workspaceId, userId: harness.hungUserId, markdown: '- Tôi lái xe 29C-123.45' });
    await insertMember(harness.database, { workspaceId: harness.workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });

    await harness.receiveText('zu-lan', 'Chào bạn');

    const system = harness.chat.requests[0]?.system ?? '';
    expect(system).toContain('Bản ghi nhớ hiện tại, dưới dạng chuỗi JSON:\n""');
    expect(system).not.toContain('29C-123.45');
  });

  it('refuses an admin memory write after the admin read member data', async () => {
    const duyUserId = await insertMember(harness.database, { workspaceId: harness.workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    harness.chat.follow((_request, callNumber) => {
      if (callNumber === 1) return replyWithToolCalls({ id: 'call_1', name: 'search_records', argumentsJson: JSON.stringify(SEARCH_EVERYTHING) });
      if (callNumber === 2) return replyWithToolCalls({ id: 'call_2', name: 'remember', argumentsJson: JSON.stringify({ fact: 'A' }) });
      return replyWithText('Hùng gửi 1 phiếu.');
    });

    await harness.receiveText('zu-duy', 'Hùng gửi gì? Nhớ là A');
    await harness.sendQueuedTexts();

    expect(await readUserMemory(harness.database, duyUserId)).toBeNull();
    expect(harness.channel.texts.map((sent) => sent.text)).toEqual([`Hùng gửi 1 phiếu.\n\n${MEMORY_REFUSED_NOTICE}`]);
  });

  it('saves a member memory write after a search', async () => {
    harness.chat.follow((_request, callNumber) => {
      if (callNumber === 1) return replyWithToolCalls({ id: 'call_1', name: 'search_records', argumentsJson: JSON.stringify(SEARCH_EVERYTHING) });
      if (callNumber === 2) return replyWithToolCalls({ id: 'call_2', name: 'remember', argumentsJson: JSON.stringify({ fact: 'A' }) });
      return replyWithText('Đã nhớ: A.');
    });

    await harness.receiveText('zu-hung', 'Tôi gửi gì hôm nay? Nhớ là A');

    expect(await readUserMemory(harness.database, harness.hungUserId)).toBe('- A');
  });

  it('logs the memory tool by name and argument name without the fact', async () => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {});
    harness.chat.follow((_request, callNumber) =>
      callNumber === 1
        ? replyWithToolCalls({ id: 'call_1', name: 'remember', argumentsJson: JSON.stringify({ fact: 'Tôi lái xe 29C-123.45' }) })
        : replyWithText('Đã nhớ.'),
    );

    await harness.receiveText('zu-hung', 'Nhớ là tôi lái xe 29C-123.45');

    const lines = logged.mock.calls.map(([line]) => String(line)).filter((line) => line.startsWith('[admin-chat]'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('remember(fact)=');
    expect(lines[0]).not.toContain('29C-123.45');
  });
});
