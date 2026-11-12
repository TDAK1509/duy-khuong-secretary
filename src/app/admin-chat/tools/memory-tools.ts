import type { ToolSpec } from '../../../services/chat/chat-service.ts';

const REMEMBER_SPEC: ToolSpec = {
  name: 'remember',
  description: 'Thêm một điều vào bản ghi nhớ riêng của người đang trò chuyện. Không thay thế các điều đã nhớ. Nếu điều này đã có, giữ nguyên.',
  parameters: {
    type: 'object',
    properties: { fact: { type: 'string', description: 'Điều cần nhớ, một dòng, từ 1 đến 200 ký tự.' } },
    required: ['fact'],
    additionalProperties: false,
  },
};

export const MEMORY_TOOLS: ToolSpec[] = [REMEMBER_SPEC];
