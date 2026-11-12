import { describe, expect, it } from 'vitest';
import { buildAdminPrompt } from '../../../src/app/admin-chat/admin-prompt.ts';

const MERGE_LINE =
  '- Khi tên in trên giấy tờ là một cách viết khác của một công ty hoặc nơi chốn đã lưu, hệ thống tự gộp tên đó vào tên đã lưu. Giấy tờ được tính ngay theo tên đã lưu. Để xem các tên đã gộp, gọi list_merged_names. Nếu không có tên nào, trả lời: "Không có tên nào đã được gộp."';
const MEMBER_DATA_LINE =
  '- Dữ liệu thành viên gồm kết quả của search_records, maintenance_status, list_document_numbers, total_document_numbers, list_organizations, list_merged_names, list_sources và list_documents.';

describe('the name merge rule of the admin prompt', () => {
  const prompt = buildAdminPrompt({ workspaceName: 'Xe tải Duy Khương', displayName: 'Duy', now: new Date('2026-10-31T10:00:00+07:00'), memory: '' });

  it('holds the merge line and ends the search section with it', () => {
    expect(prompt).toContain(`${MERGE_LINE}\n\nNguồn dữ liệu:`);
  });

  it('holds the member data line', () => {
    expect(prompt.split('\n')).toContain(MEMBER_DATA_LINE);
  });

  it('names no review_name_matches tool', () => {
    expect(prompt).not.toContain('review_name_matches');
  });
});
