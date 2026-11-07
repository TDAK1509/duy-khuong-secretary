import { describe, expect, it } from 'vitest';
import { ADMIN_TOOLS } from '../../../src/app/admin-chat/tools/admin-tools.ts';

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
  "description": "Liệt kê các nhãn chi tiết có số chuẩn trong các mục phù hợp, kèm đơn vị và số giá trị. Lọc giống search_records. Gọi trước total_numbers khi chưa biết nhãn. Không tự coi hai nhãn khác nghĩa là một.",
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
  "description": "Tính tổng, số giá trị, nhỏ nhất và lớn nhất dưới một nhãn trong mọi mục phù hợp. Các đơn vị luôn tách riêng. Lọc giống search_records, không phân trang. Có thể nhóm theo thành viên, xe, loại hoặc ngày trên giấy tờ. Các kết quả tổng, nhỏ nhất và lớn nhất là chuỗi số thập phân. without_number đếm mục có nhãn này nhưng thiếu số chuẩn.",
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
});
