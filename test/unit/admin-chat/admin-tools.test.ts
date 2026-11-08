import { describe, expect, it } from 'vitest';
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

  it('offers list_number_labels with the exact text and the eight search filters', () => {
    const tool = ADMIN_TOOLS.find((candidate) => candidate.name === 'list_number_labels');

    expect(tool).toStrictEqual({
  "name": "list_number_labels",
  "description": "Liệt kê các nhãn chi tiết trong các mục phù hợp, kèm đơn vị và số giá trị. unit là null khi giá trị chưa có cặp số và đơn vị hợp lệ. Một nhãn có thể có các dòng có đơn vị và một dòng có unit là null. Lọc giống search_records. Gọi trước total_numbers khi chưa biết nhãn. Không tự coi hai nhãn khác nghĩa là một.",
  "parameters": {
    "type": "object",
    "properties": {
      "text": {
        "type": [
          "string",
          "null"
        ],
        "description": "Từ khóa tìm trong mô tả, mã, biển số và chi tiết. Không phân biệt dấu và chữ hoa. null nếu không lọc theo từ khóa."
      },
      "category": {
        "type": [
          "string",
          "null"
        ],
        "description": "Tên loại đã lưu, ví dụ \"đổ xăng dầu\", \"kiểm định xe\". Không có danh sách loại cố định. null để tìm mọi loại. Nếu chưa biết đúng tên loại, để null và dùng text."
      },
      "member": {
        "type": [
          "string",
          "null"
        ],
        "description": "Tên của thành viên cần lọc. null để lấy mọi thành viên."
      },
      "plate": {
        "type": [
          "string",
          "null"
        ],
        "description": "Biển số xe cần lọc, ví dụ \"29C-123.45\". null nếu không lọc theo xe."
      },
      "added_from": {
        "type": [
          "string",
          "null"
        ],
        "description": "Lấy mục gửi từ ngày này, dạng YYYY-MM-DD, giờ Việt Nam. null nếu không giới hạn."
      },
      "added_to": {
        "type": [
          "string",
          "null"
        ],
        "description": "Lấy mục gửi đến hết ngày này, dạng YYYY-MM-DD, giờ Việt Nam. null nếu không giới hạn."
      },
      "occurred_from": {
        "type": [
          "string",
          "null"
        ],
        "description": "Lấy mục có ngày công việc trên giấy tờ từ ngày này, dạng YYYY-MM-DD, tính cả ngày này. Mục thiếu ngày bị loại. null nếu không giới hạn."
      },
      "occurred_to": {
        "type": [
          "string",
          "null"
        ],
        "description": "Lấy mục có ngày công việc trên giấy tờ đến hết ngày này, dạng YYYY-MM-DD. Mục thiếu ngày bị loại. null nếu không giới hạn."
      }
    },
    "required": [
      "text",
      "category",
      "member",
      "plate",
      "added_from",
      "added_to",
      "occurred_from",
      "occurred_to"
    ],
    "additionalProperties": false
  }
});
    expect(Object.keys(tool?.parameters['properties'] as object)).toEqual(tool?.parameters['required']);
  });

  it('offers total_numbers with the exact text, the label, the eight search filters and group_by', () => {
    const tool = ADMIN_TOOLS.find((candidate) => candidate.name === 'total_numbers');

    expect(tool).toStrictEqual({
  "name": "total_numbers",
  "description": "Tính tổng, số giá trị, nhỏ nhất và lớn nhất dưới một nhãn trong các mục phù hợp. Các bản lưu trùng loại, số chứng từ, biển số và ngày trên giấy tờ chỉ lấy bản mới nhất có nhãn đó trong các mục phù hợp. Mục không có số chứng từ luôn tính riêng. Các đơn vị luôn tách riêng. Lọc giống search_records, không phân trang. Có thể nhóm theo thành viên, xe, loại hoặc ngày trên giấy tờ. Các kết quả tổng, nhỏ nhất và lớn nhất là chuỗi số thập phân. without_number đếm mục được chọn có nhãn này nhưng thiếu số chuẩn.",
  "parameters": {
    "type": "object",
    "properties": {
      "label": {
        "type": "string",
        "description": "Nhãn chi tiết cần tính, chép từ list_number_labels. Không phân biệt dấu, chữ hoa hoặc khoảng trắng thừa. Không tự đổi hoặc gộp nhãn."
      },
      "text": {
        "type": [
          "string",
          "null"
        ],
        "description": "Từ khóa tìm trong mô tả, mã, biển số và chi tiết. Không phân biệt dấu và chữ hoa. null nếu không lọc theo từ khóa."
      },
      "category": {
        "type": [
          "string",
          "null"
        ],
        "description": "Tên loại đã lưu, ví dụ \"đổ xăng dầu\", \"kiểm định xe\". Không có danh sách loại cố định. null để tìm mọi loại. Nếu chưa biết đúng tên loại, để null và dùng text."
      },
      "member": {
        "type": [
          "string",
          "null"
        ],
        "description": "Tên của thành viên cần lọc. null để lấy mọi thành viên."
      },
      "plate": {
        "type": [
          "string",
          "null"
        ],
        "description": "Biển số xe cần lọc, ví dụ \"29C-123.45\". null nếu không lọc theo xe."
      },
      "added_from": {
        "type": [
          "string",
          "null"
        ],
        "description": "Lấy mục gửi từ ngày này, dạng YYYY-MM-DD, giờ Việt Nam. null nếu không giới hạn."
      },
      "added_to": {
        "type": [
          "string",
          "null"
        ],
        "description": "Lấy mục gửi đến hết ngày này, dạng YYYY-MM-DD, giờ Việt Nam. null nếu không giới hạn."
      },
      "occurred_from": {
        "type": [
          "string",
          "null"
        ],
        "description": "Lấy mục có ngày công việc trên giấy tờ từ ngày này, dạng YYYY-MM-DD, tính cả ngày này. Mục thiếu ngày bị loại. null nếu không giới hạn."
      },
      "occurred_to": {
        "type": [
          "string",
          "null"
        ],
        "description": "Lấy mục có ngày công việc trên giấy tờ đến hết ngày này, dạng YYYY-MM-DD. Mục thiếu ngày bị loại. null nếu không giới hạn."
      },
      "group_by": {
        "type": "string",
        "enum": [
          "none",
          "member",
          "plate",
          "category",
          "occurred_on"
        ],
        "description": "none: không chia nhóm. member: theo thành viên. plate: theo xe. category: theo loại. occurred_on: theo ngày trên giấy tờ."
      }
    },
    "required": [
      "label",
      "text",
      "category",
      "member",
      "plate",
      "added_from",
      "added_to",
      "occurred_from",
      "occurred_to",
      "group_by"
    ],
    "additionalProperties": false
  }
});
    expect(Object.keys(tool?.parameters['properties'] as object)).toEqual(tool?.parameters['required']);
  });

  it('lists the two number tools at the end, after the existing tools', () => {
    expect(ADMIN_TOOLS.map((tool) => tool.name).slice(-2)).toEqual(['list_number_labels', 'total_numbers']);
  });

  it('offers total_document_numbers with the exact text, the filters and group_by', () => {
    const tool = ADMIN_TOOLS.find((candidate) => candidate.name === 'total_document_numbers');

    expect(tool).toStrictEqual({
      name: 'total_document_numbers',
      description:
        'Tính tổng, số giá trị, nhỏ nhất và lớn nhất của một ý nghĩa số trên các giấy tờ đã chấp nhận và phù hợp. Mỗi giấy tờ chỉ tính một lần dù có nhiều ảnh. Các đơn vị luôn tách riêng. Chỉ tính tên đã xác nhận. pending_name_documents đếm giấy tờ bị bỏ qua vì tên đang chờ xác nhận. review_documents đếm giấy tờ đang chờ xem lại. without_number đếm giấy tờ phù hợp nhưng không có số này. not_reread_messages đếm tin nhắn đã lưu nhưng chưa được đọc lại thành giấy tờ.',
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

  it('offers list_organizations with the exact text and the text filter', () => {
    const tool = ADMIN_TOOLS.find((candidate) => candidate.name === 'list_organizations');

    expect(tool).toStrictEqual({
      name: 'list_organizations',
      description: 'Liệt kê các công ty và nơi chốn đã lưu trong nhóm: tên, loại, các cách viết đã gặp và số giấy tờ. Lọc theo text nếu có.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: ['string', 'null'],
            description: 'Một phần tên cần tìm, không phân biệt dấu và chữ hoa. null để lấy tất cả.',
          },
        },
        required: ['text'],
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
});
