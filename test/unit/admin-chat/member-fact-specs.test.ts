import { describe, expect, it } from 'vitest';
import { MEMBER_FACT_TOOLS } from '../../../src/app/admin-chat/tools/member-fact-specs.ts';

describe('the member fact tool specs', () => {
  it('offers list_member_facts with the exact text', () => {
    const tool = findTool('list_member_facts');

    expect(tool).toStrictEqual({
      name: 'list_member_facts',
      description: 'Liệt kê các thông tin quản lý đã lưu về một người trong nhóm, đúng như đã lưu.',
      parameters: {
        type: 'object',
        properties: { member_id: { type: 'string', description: 'id của người cần xem, lấy từ list_members.' } },
        required: ['member_id'],
        additionalProperties: false,
      },
    });
  });

  function findTool(name: string) {
    return MEMBER_FACT_TOOLS.find((candidate) => candidate.name === name);
  }
});
