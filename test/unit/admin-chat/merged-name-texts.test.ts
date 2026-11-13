import { describe, expect, it } from 'vitest';
import { buildAbilitySection } from '../../../src/app/admin-chat/ability-section.ts';
import { buildAdminPrompt } from '../../../src/app/admin-chat/admin-prompt.ts';
import { CHANGE_REFUSED_NOTICE } from '../../../src/app/admin-chat/chat-texts.ts';
import { ADMIN_TOOLS } from '../../../src/app/admin-chat/tools/admin-tools.ts';

const CHANGE_LINE = '- Việc thay đổi gồm create_scheduled_task, cancel_scheduled_task, create_invite, remove_member, add_member_fact, forget_member_fact, forget_all_member_facts, remember, forget, forget_all và split_merged_name.';
const MEMBER_DATA_LINE =
  '- Dữ liệu thành viên gồm kết quả của search_records, count_records, maintenance_status, list_document_numbers, total_document_numbers, list_organizations, list_merged_names, list_sources và list_documents.';
const ASK_FIRST_LINE =
  '- Khi quản lý nhờ một việc thay đổi, không gọi các công cụ đọc dữ liệu thành viên. Để lấy id, dùng list_members, list_member_facts hoặc list_scheduled_tasks.';
const SPLIT_LINE =
  '- Để tách một tên bị gộp sai, gọi split_merged_name với đúng tên quản lý viết trong tin nhắn. Không gọi list_merged_names trước. Nếu quản lý chỉ nói số thứ tự hoặc chưa viết tên, hỏi lại tên cần tách. Sau khi tách, trả lời ngắn: đã tách tên nào và bao nhiêu giấy tờ.';
const MERGE_LINE =
  '- Khi tên in trên giấy tờ là một cách viết khác của một công ty hoặc nơi chốn đã lưu, hệ thống tự gộp tên đó vào tên đã lưu. Giấy tờ được tính ngay theo tên đã lưu. Để xem các tên đã gộp, gọi list_merged_names. Nếu không có tên nào, trả lời: "Không có tên nào đã được gộp."';

describe('the texts of the merged name tools', () => {
  const prompt = buildAdminPrompt({ workspaceName: 'Xe tải Duy Khương', displayName: 'Duy', now: new Date('2026-10-31T10:00:00+07:00'), memory: '' });
  const promptLines = prompt.split('\n');

  it('offers list_merged_names with the exact text and parameter', () => {
    expect(ADMIN_TOOLS.find((tool) => tool.name === 'list_merged_names')).toStrictEqual({
      name: 'list_merged_names',
      description:
        'Liệt kê các tên đọc được trên giấy tờ mà hệ thống đã tự gộp vào một công ty hoặc nơi chốn đã lưu: tên đọc được, tên đã lưu, ngày gộp (giờ Việt Nam) và số giấy tờ. Mới nhất trước. Tối đa 50 tên. left_out đếm số tên phù hợp không có trong kết quả.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: ['string', 'null'],
            description: 'Một phần tên đọc được hoặc tên đã lưu, không phân biệt dấu và chữ hoa. null để lấy tất cả.',
          },
        },
        required: ['text'],
        additionalProperties: false,
      },
    });
  });

  it('offers split_merged_name with the exact text and parameter', () => {
    expect(ADMIN_TOOLS.find((tool) => tool.name === 'split_merged_name')).toStrictEqual({
      name: 'split_merged_name',
      description:
        'Tách một tên đã tự gộp thành một công ty hoặc nơi chốn riêng. Mọi giấy tờ cũ và mới có đúng tên này được tính cho bên riêng đó, không tính cho tên đã lưu nữa. Kết quả là số giấy tờ đã chuyển.',
      parameters: {
        type: 'object',
        properties: {
          printed_name: { type: 'string', description: 'Tên cần tách, chép đúng từ tin nhắn của quản lý. Không phân biệt dấu và chữ hoa.' },
        },
        required: ['printed_name'],
        additionalProperties: false,
      },
    });
  });

  it('holds the two ability lines', () => {
    const section = buildAbilitySection(ADMIN_TOOLS).split('\n');

    expect(section).toContain('- Cho biết các tên công ty, nơi chốn đã được tự gộp vào tên đã lưu.');
    expect(section).toContain('- Tách một tên bị gộp sai thành một công ty hoặc nơi chốn riêng.');
  });

  it.each([MERGE_LINE, CHANGE_LINE, MEMBER_DATA_LINE])('holds the prompt line %s', (line) => {
    expect(promptLines).toContain(line);
  });

  it('puts the split line right after the line that asks to avoid member data tools', () => {
    expect(promptLines[promptLines.indexOf(ASK_FIRST_LINE) + 1]).toBe(SPLIT_LINE);
  });

  it('holds the refusal notice that names the split', () => {
    expect(CHANGE_REFUSED_NOTICE).toBe(
      'Có việc tôi chưa làm (đặt lịch, hủy lịch, mời hoặc xóa người, ghi nhớ hoặc quên, tách tên đã gộp, lưu hoặc xóa thông tin về thành viên) vì tin nhắn này đi kèm dữ liệu đọc từ ảnh, hoặc tôi đã đọc dữ liệu do thành viên gửi.\nNếu bạn vẫn muốn, hãy nhắn lại riêng yêu cầu này.',
    );
  });
});
