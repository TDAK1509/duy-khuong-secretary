import { describe, expect, it } from 'vitest';
import { listChatTools } from '../../../src/app/admin-chat/tools/chat-tools.ts';
import { MEMORY_TOOLS } from '../../../src/app/admin-chat/tools/memory-tools.ts';

describe('the memory tools', () => {
  it('describe remember, forget and forget_all with the exact texts', () => {
    expect(MEMORY_TOOLS.map((tool) => [tool.name, tool.description])).toEqual([
      ['remember', 'Thêm một điều vào bản ghi nhớ riêng của người đang trò chuyện. Không thay thế các điều đã nhớ. Nếu điều này đã có, giữ nguyên.'],
      ['forget', 'Xóa đúng một điều đang có trong bản ghi nhớ riêng của người đang trò chuyện. Không sửa hoặc xóa điều khác.'],
      ['forget_all', 'Xóa toàn bộ bản ghi nhớ riêng của người đang trò chuyện. Chỉ dùng khi người này yêu cầu quên hết.'],
    ]);
  });

  it('describe the fact of remember and forget', () => {
    const [remember, forget] = MEMORY_TOOLS;

    expect(remember?.parameters['properties']).toEqual({ fact: { type: 'string', description: 'Điều cần nhớ, một dòng, từ 1 đến 200 ký tự.' } });
    expect(forget?.parameters['properties']).toEqual({
      fact: { type: 'string', description: 'Nội dung điều cần quên, chép đúng như trong bản ghi nhớ, không gồm dấu "- ".' },
    });
  });

  it('forbid other properties', () => {
    for (const tool of MEMORY_TOOLS) expect(tool.parameters['additionalProperties']).toBe(false);
  });

  it.each(['admin', 'member'] as const)('end the tool list of the %s', (role) => {
    expect(listChatTools(role).map((tool) => tool.name).slice(-3)).toEqual(['remember', 'forget', 'forget_all']);
  });
});
