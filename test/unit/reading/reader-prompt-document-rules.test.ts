import { describe, expect, it } from 'vitest';
import { EMPTY_READER_CATALOG } from '../../../src/app/reading/document-rules.ts';
import { buildReaderPrompt } from '../../../src/app/reading/reader-prompt.ts';

const TODAY = new Date('2026-10-30T18:00:00Z');

describe('buildReaderPrompt document rules', () => {
  it('holds rules 12 to 17 word for word', () => {
    const lines = buildReaderPrompt(TODAY, [], EMPTY_READER_CATALOG).split('\n');

    expect(lines).toContain(
      '12. document_kind: tên loại giấy tờ, ngắn, chữ thường, theo mẫu giấy tờ, ví dụ "phiếu cân xe", "phiếu cân nhà máy", "giấy chứng nhận kiểm định", "hóa đơn". Cùng một mẫu giấy tờ luôn dùng cùng một tên.',
    );
    expect(lines).toContain(
      '13. stage: "dispatch" nếu giấy tờ ghi nhận hàng rời nơi giao, ví dụ phiếu cân ghi "XUẤT HÀNG" hoặc phiếu xuất kho. "receipt" nếu giấy tờ ghi nhận hàng đến nơi nhận, ví dụ phiếu cân của nhà máy nhận hàng có giờ vào và ra xưởng. null nếu giấy tờ không ghi nhận việc giao hoặc nhận hàng, hoặc không rõ.',
    );
    expect(lines).toContain(
      '14. parties: các công ty và nơi chốn in trên giấy tờ, mỗi bên một phần tử. role: "issuer" là bên phát hành giấy tờ, thường in ở đầu hoặc chân giấy; "supplier" là bên bán hoặc cung cấp hàng, dịch vụ; "customer" là bên nhận hàng hoặc mua hàng; "carrier" là bên vận chuyển; "place" là nơi chốn như kho, cảng, bãi. Nếu bên phát hành cũng là bên nhận hàng, ghi hai phần tử cùng tên: một "issuer" và một "customer". type: "company" cho công ty, nhà máy, cơ quan; "place" cho nơi chốn. printed_name: tên chép đúng từng chữ như trên giấy tờ. Không bỏ tên in ở chân trang. known_name: nếu bên này là một tên trong danh sách tên đã biết, ghi đúng tên trong danh sách; null nếu không phải hoặc không chắc. Không ghi người ký tên hoặc nhân viên vào parties.',
    );
    expect(lines).toContain(
      '15. meaning trong mỗi chi tiết: ý nghĩa của chi tiết có số hoặc có ngày giờ. Dùng đúng một tên trong danh sách ý nghĩa nếu cùng nghĩa. Nếu không có tên cùng nghĩa, ghi một tên ngắn mới bằng tiếng Việt, viết hoa chữ cái đầu. null nếu chi tiết không có số và không có ngày giờ. "Trọng lượng hàng" là trọng lượng hàng cân được; trọng lượng hàng đã trừ độ ẩm hoặc tạp chất là "Trọng lượng hàng sau khấu trừ". "Thành tiền" là tiền của một dòng hàng hoặc một việc; tiền của cả giấy tờ là "Tổng tiền trước thuế", "Tiền thuế" hoặc "Tổng tiền thanh toán". Số chép từ một giấy tờ khác, ví dụ trọng lượng của phiếu cân khác ghi trong ghi chú, không phải số của giấy tờ này: đặt meaning, number và unit là null, giữ nguyên value.',
    );
    expect(lines).toContain(
      '16. item trong mỗi chi tiết: tên hàng hoặc tên việc mà chi tiết thuộc về khi giấy tờ có nhiều dòng hàng hoặc nhiều việc, chép như trên giấy tờ; với hóa đơn bảo dưỡng, ghi đúng maintenance_item của phần tử. null nếu chi tiết thuộc cả giấy tờ.',
    );
    expect(lines).toContain(
      '17. date_time trong mỗi chi tiết: nếu giá trị là ngày, ghi dạng YYYY-MM-DD; nếu là ngày giờ, ghi dạng YYYY-MM-DDTHH:mm:ss, theo giờ in trên giấy tờ. Nếu giấy tờ không ghi năm, để null. null trong trường hợp khác. Ghi mọi ngày giờ in trên giấy tờ thành chi tiết, kể cả giờ cân, giờ in và ngày hết hạn.',
    );
  });

  it('puts rules 12 to 17 between the document number rule and the general rules', () => {
    const lines = buildReaderPrompt(TODAY, [], EMPTY_READER_CATALOG).split('\n');

    const ruleStarts = lines.map((line) => line.split(' ')[0]);
    const first = ruleStarts.indexOf('11.');
    expect(ruleStarts.slice(first, first + 8)).toEqual(['11.', '12.', '13.', '14.', '15.', '15b.', '16.', '17.']);
    expect(lines[first + 8]).toBe('');
    expect(lines[first + 9]).toBe('Quy tắc:');
  });
});
