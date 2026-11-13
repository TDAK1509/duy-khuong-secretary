import { describe, expect, it } from 'vitest';
import { MEMBER_TEXT_TOOLS } from '../../../src/app/admin-chat/tools/admin-text-guard.ts';
import { ADMIN_TOOLS } from '../../../src/app/admin-chat/tools/admin-tools.ts';

const DOCUMENT_FILTER_PROPERTIES = {
  organization: {
    type: ['string', 'null'],
    description: 'Tên công ty hoặc nơi chốn, chép đúng từ list_organizations. null nếu không lọc theo tên.',
  },
  role: {
    type: ['string', 'null'],
    enum: ['issuer', 'supplier', 'customer', 'carrier', 'place', null],
    description:
      'Vai trò của tên trên giấy tờ. issuer: bên phát hành. supplier: bên bán. customer: bên nhận hàng hoặc mua hàng. carrier: bên vận chuyển. place: nơi chốn. null để chấp nhận mọi vai trò.',
  },
  stage: {
    type: ['string', 'null'],
    enum: ['dispatch', 'receipt', null],
    description: 'dispatch: giấy tờ lúc hàng rời nơi giao. receipt: giấy tờ lúc hàng đến nơi nhận. null nếu không lọc.',
  },
  kind: {
    type: ['string', 'null'],
    description: 'Loại giấy tờ đã lưu, ví dụ "phiếu cân xe". null để lấy mọi loại.',
  },
  plate: {
    type: ['string', 'null'],
    description: 'Biển số xe cần lọc, ví dụ "29C-123.45". null nếu không lọc theo xe.',
  },
  date_meaning: {
    type: ['string', 'null'],
    description: 'Ý nghĩa ngày dùng để lọc và chia nhóm, chép từ list_document_numbers. null để dùng ngày trên giấy tờ.',
  },
  date_from: {
    type: ['string', 'null'],
    description: 'Từ ngày này, dạng YYYY-MM-DD, tính cả ngày này. null nếu không giới hạn.',
  },
  date_to: {
    type: ['string', 'null'],
    description: 'Đến hết ngày này, dạng YYYY-MM-DD. null nếu không giới hạn.',
  },
};

describe('the admin tool list', () => {
  it('offers create_scheduled_task with its description', () => {
    const tool = ADMIN_TOOLS.find((candidate) => candidate.name === 'create_scheduled_task');

    expect(tool?.description).toBe(
      'Đặt lịch để Trợ lý tự làm một việc vào giờ đã hẹn và gửi kết quả cho quản lý. Giờ là giờ Việt Nam. Lịch được lưu và bắt đầu chạy ngay.',
    );
  });

  it('describes the roles of create_invite for a member who chats and an admin who manages', () => {
    const tool = ADMIN_TOOLS.find((candidate) => candidate.name === 'create_invite');
    const properties = tool?.parameters['properties'] as Record<string, { description: string }>;

    expect(properties['role']?.description).toBe(
      'member: thành viên, trò chuyện và xem dữ liệu của chính mình. admin: quản lý, xem dữ liệu công việc của nhóm và dùng công cụ quản lý.',
    );
  });

  it('offers list_members with the join date and no Zalo name', () => {
    const tool = ADMIN_TOOLS.find((candidate) => candidate.name === 'list_members');

    expect(tool?.description).toBe('Liệt kê mọi người trong nhóm: id, tên trong nhóm, vai trò, ngày vào nhóm.');
  });

  it('offers search_records with a free category and no fixed list', () => {
    const tool = ADMIN_TOOLS.find((candidate) => candidate.name === 'search_records');
    const category = (tool?.parameters['properties'] as Record<string, unknown>)['category'];

    expect(category).toEqual({
      type: ['string', 'null'],
      description:
        'Tên loại đã lưu, ví dụ "đổ xăng dầu", "kiểm định xe". Không có danh sách loại cố định. null để tìm mọi loại. Nếu chưa biết đúng tên loại, để null và dùng text.',
    });
  });

  it('offers search_records with the document date range after the date sent range', () => {
    const tool = ADMIN_TOOLS.find((candidate) => candidate.name === 'search_records');
    const properties = tool?.parameters['properties'] as Record<string, unknown>;

    expect(tool?.description).toBe(
      'Tìm dữ liệu đã lưu trong nhóm. Lọc được theo ngày gửi và ngày trên giấy tờ. Trả về tối đa 50 mục mỗi trang, mới nhất trước. Nếu next_cursor khác null, gọi lại với cursor đó để đọc trang tiếp theo.',
    );
    expect(Object.keys(properties)).toEqual(['text', 'category', 'member', 'plate', 'added_from', 'added_to', 'occurred_from', 'occurred_to', 'cursor']);
    expect(properties['occurred_from']).toEqual({
      type: ['string', 'null'],
      description: 'Lấy mục có ngày công việc trên giấy tờ từ ngày này, dạng YYYY-MM-DD, tính cả ngày này. Mục thiếu ngày bị loại. null nếu không giới hạn.',
    });
    expect(properties['occurred_to']).toEqual({
      type: ['string', 'null'],
      description: 'Lấy mục có ngày công việc trên giấy tờ đến hết ngày này, dạng YYYY-MM-DD. Mục thiếu ngày bị loại. null nếu không giới hạn.',
    });
    expect(tool?.parameters['required']).toEqual(['text', 'category', 'member', 'plate', 'added_from', 'added_to', 'occurred_from', 'occurred_to', 'cursor']);
  });

  it('offers no propose_scheduled_task', () => {
    expect(ADMIN_TOOLS.map((tool) => tool.name)).not.toContain('propose_scheduled_task');
  });

  it('offers total_document_numbers with the exact text, the filters and group_by', () => {
    const tool = ADMIN_TOOLS.find((candidate) => candidate.name === 'total_document_numbers');

    expect(tool).toStrictEqual({
      name: 'total_document_numbers',
      description:
        'Tính tổng, số giá trị, nhỏ nhất và lớn nhất của một ý nghĩa số trên các giấy tờ đã chấp nhận và phù hợp. Mỗi giấy tờ chỉ tính một lần dù có nhiều ảnh. Các đơn vị luôn tách riêng. review_documents đếm giấy tờ đang chờ xem lại. without_number đếm giấy tờ phù hợp nhưng không có số này. not_reread_messages đếm tin nhắn đã lưu nhưng chưa được đọc lại thành giấy tờ.',
      parameters: {
        type: 'object',
        properties: {
          meaning: { type: 'string', description: 'Ý nghĩa số cần tính, chép đúng từ list_document_numbers.' },
          lines: {
            type: 'string',
            enum: ['document', 'item'],
            description: 'document: chỉ tính số của cả giấy tờ. item: chỉ tính số của từng dòng hàng hoặc từng việc.',
          },
          ...DOCUMENT_FILTER_PROPERTIES,
          group_by: {
            type: 'string',
            enum: ['none', 'organization', 'kind', 'plate', 'stage', 'day', 'month'],
            description:
              'none: không chia nhóm. organization: theo tên công ty hoặc nơi chốn ở vai trò đã lọc. kind: theo loại giấy tờ. plate: theo xe. stage: theo giao hoặc nhận. day: theo ngày. month: theo tháng.',
          },
        },
        required: ['meaning', 'lines', ...Object.keys(DOCUMENT_FILTER_PROPERTIES), 'group_by'],
        additionalProperties: false,
      },
    });
  });

  it('offers list_document_numbers with the exact text and the filters', () => {
    const tool = ADMIN_TOOLS.find((candidate) => candidate.name === 'list_document_numbers');

    expect(tool).toStrictEqual({
      name: 'list_document_numbers',
      description:
        'Liệt kê các ý nghĩa số và ý nghĩa ngày có trong các giấy tờ phù hợp, kèm loại (số hoặc ngày), đơn vị, số giấy tờ có số của cả giấy tờ và số giấy tờ có số theo từng dòng. Gọi trước total_document_numbers khi câu hỏi chưa nói rõ số nào hoặc ngày nào.',
      parameters: {
        type: 'object',
        properties: DOCUMENT_FILTER_PROPERTIES,
        required: Object.keys(DOCUMENT_FILTER_PROPERTIES),
        additionalProperties: false,
      },
    });
  });

  it('offers list_organizations with the exact text, the text filter and the cursor', () => {
    const tool = ADMIN_TOOLS.find((candidate) => candidate.name === 'list_organizations');

    expect(tool).toStrictEqual({
      name: 'list_organizations',
      description:
        'Liệt kê các công ty và nơi chốn đã lưu trong nhóm: tên, loại, các cách viết đã gặp và số giấy tờ. Lọc theo text nếu có. Trả về tối đa 50 tên mỗi trang, theo thứ tự tên. Nếu next_cursor khác null, gọi lại với cursor đó để đọc trang tiếp theo.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: ['string', 'null'],
            description: 'Một phần tên cần tìm, không phân biệt dấu và chữ hoa. null để lấy tất cả.',
          },
          cursor: {
            type: ['string', 'null'],
            description: 'Giá trị next_cursor của trang trước. null cho trang đầu. Giữ nguyên text khi xem trang tiếp theo.',
          },
        },
        required: ['text', 'cursor'],
        additionalProperties: false,
      },
    });
  });

  it('offers search_records with the exact text, member, plate and date sent filters', () => {
    const tool = ADMIN_TOOLS.find((candidate) => candidate.name === 'search_records');
    const properties = tool?.parameters['properties'] as Record<string, unknown>;

    expect(properties['text']).toStrictEqual({
      type: ['string', 'null'],
      description: 'Từ khóa tìm trong mô tả, mã, biển số và chi tiết. Không phân biệt dấu và chữ hoa. null nếu không lọc theo từ khóa.',
    });
    expect(properties['member']).toStrictEqual({
      type: ['string', 'null'],
      description: 'Tên của thành viên cần lọc. null để lấy mọi thành viên.',
    });
    expect(properties['plate']).toStrictEqual({
      type: ['string', 'null'],
      description: 'Biển số xe cần lọc, ví dụ "29C-123.45". null nếu không lọc theo xe.',
    });
    expect(properties['added_from']).toStrictEqual({
      type: ['string', 'null'],
      description: 'Lấy mục gửi từ ngày này, dạng YYYY-MM-DD, giờ Việt Nam. null nếu không giới hạn.',
    });
    expect(properties['added_to']).toStrictEqual({
      type: ['string', 'null'],
      description: 'Lấy mục gửi đến hết ngày này, dạng YYYY-MM-DD, giờ Việt Nam. null nếu không giới hạn.',
    });
  });

  it('lists the four document tools at the end, after the existing tools', () => {
    expect(ADMIN_TOOLS.map((tool) => tool.name).slice(-4)).toEqual(['list_document_numbers', 'total_document_numbers', 'list_organizations', 'list_documents']);
  });

  it('offers list_sources after attach_photos with the exact text and parameters', () => {
    const names = ADMIN_TOOLS.map((tool) => tool.name);

    expect(names[names.indexOf('attach_photos') + 1]).toBe('list_sources');
    expect(ADMIN_TOOLS.find((candidate) => candidate.name === 'list_sources')).toStrictEqual({
      name: 'list_sources',
      description:
        'Tìm tin gốc của các mục dữ liệu: ai gửi, gửi lúc nào (giờ Việt Nam), gửi ảnh hay tin nhắn, và ngày trên giấy tờ. Lấy record_ids từ search_records, document_ids từ list_documents. Tối đa 5 tin gốc mỗi lần gọi, theo thứ tự id. Hệ thống tự gửi một thẻ nguồn có nguyên văn tin nhắn cho mỗi tin gốc ngay sau câu trả lời. left_out đếm số id không có trong kết quả. Nếu quoted là true, thẻ nguồn trích lại tin gốc trong cuộc trò chuyện này.',
      parameters: {
        type: 'object',
        properties: {
          record_ids: { type: 'array', items: { type: 'string' }, description: 'id các mục cần xem nguồn, lấy từ search_records. Mảng rỗng nếu không có.' },
          document_ids: { type: 'array', items: { type: 'string' }, description: 'id các giấy tờ cần xem nguồn, lấy từ list_documents. Mảng rỗng nếu không có.' },
        },
        required: ['record_ids', 'document_ids'],
        additionalProperties: false,
      },
    });
  });

  it('offers attach_photos with the exact text and the record and document ids', () => {
    expect(ADMIN_TOOLS.find((candidate) => candidate.name === 'attach_photos')).toStrictEqual({
      name: 'attach_photos',
      description:
        'Gửi kèm ảnh gốc của các mục dữ liệu hoặc giấy tờ ngay sau câu trả lời, mỗi ảnh một tin nhắn. Lấy record_ids từ search_records, document_ids từ list_documents. Tối đa 4 ảnh. Mục không có ảnh hoặc không được phép xem sẽ bị bỏ qua.',
      parameters: {
        type: 'object',
        properties: {
          record_ids: { type: 'array', items: { type: 'string' }, description: 'id của các mục cần gửi ảnh. Mảng rỗng nếu không có.' },
          document_ids: { type: 'array', items: { type: 'string' }, description: 'id của các giấy tờ cần gửi ảnh, lấy từ list_documents. Mảng rỗng nếu không có.' },
        },
        required: ['record_ids', 'document_ids'],
        additionalProperties: false,
      },
    });
  });

  it('offers list_documents with the exact text, the filters and the cursor', () => {
    expect(ADMIN_TOOLS.find((candidate) => candidate.name === 'list_documents')).toStrictEqual({
      name: 'list_documents',
      description:
        'Liệt kê các giấy tờ được tính trong total_document_numbers với cùng meaning, lines và bộ lọc. Trả về id, loại, giao hoặc nhận, số giấy tờ, ngày trên giấy tờ, biển số, tóm tắt và các số được tính. Mỗi giấy tờ xuất hiện một lần. Tối đa 20 giấy tờ mỗi trang. Nếu next_cursor khác null, gọi lại với cursor đó. Dùng id với list_sources và attach_photos.',
      parameters: {
        type: 'object',
        properties: {
          meaning: { type: 'string', description: 'Ý nghĩa số cần xem nguồn, chép đúng từ yêu cầu total_document_numbers.' },
          lines: {
            type: 'string',
            enum: ['document', 'item'],
            description: 'document: số của cả giấy tờ. item: số của từng dòng hàng hoặc từng việc. Dùng đúng mức đã tính tổng.',
          },
          ...DOCUMENT_FILTER_PROPERTIES,
          cursor: { type: ['string', 'null'], description: 'Giá trị next_cursor của trang trước. null cho trang đầu.' },
        },
        required: ['meaning', 'lines', ...Object.keys(DOCUMENT_FILTER_PROPERTIES), 'cursor'],
        additionalProperties: false,
      },
    });
  });
});

describe('the removed name review tool', () => {
  it('is named by no admin tool and no member text tool', () => {
    expect(ADMIN_TOOLS.map((tool) => tool.name)).not.toContain('review_name_matches');
    expect(MEMBER_TEXT_TOOLS).not.toContain('review_name_matches');
  });
});
