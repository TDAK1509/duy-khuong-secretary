import type { ToolSpec } from '../../../services/chat/chat-service.ts';

export const SEARCH_RECORDS_SPEC: ToolSpec = {
  "name": "search_records",
  "description": "Tìm dữ liệu đã lưu trong nhóm. Trả về tối đa 50 mục mỗi trang, mới nhất trước. Nếu next_cursor khác null, gọi lại với cursor đó để đọc trang tiếp theo.",
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
        "enum": [
          "fuel",
          "toll",
          "delivery_pickup",
          "delivery_dropoff",
          "maintenance",
          "certificate",
          "other",
          null
        ],
        "description": "Loại mục cần tìm. null để tìm mọi loại."
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
      "cursor": {
        "type": [
          "string",
          "null"
        ],
        "description": "Giá trị next_cursor của trang trước. null cho trang đầu."
      }
    },
    "required": [
      "text",
      "category",
      "member",
      "plate",
      "added_from",
      "added_to",
      "cursor"
    ],
    "additionalProperties": false
  }
};

export const COUNT_RECORDS_SPEC: ToolSpec = {
  "name": "count_records",
  "description": "Đếm chính xác số mục và tổng tiền theo từng loại, cho từng thành viên, trong khoảng ngày gửi. Có cả thành viên không gửi gì.",
  "parameters": {
    "type": "object",
    "properties": {
      "added_from": {
        "type": "string",
        "description": "Ngày bắt đầu, dạng YYYY-MM-DD, giờ Việt Nam, tính cả ngày này."
      },
      "added_to": {
        "type": "string",
        "description": "Ngày kết thúc, dạng YYYY-MM-DD, giờ Việt Nam, tính cả ngày này."
      }
    },
    "required": [
      "added_from",
      "added_to"
    ],
    "additionalProperties": false
  }
};

export const LIST_MEMBERS_SPEC: ToolSpec = {
  "name": "list_members",
  "description": "Liệt kê mọi người trong nhóm: id, tên trong nhóm, tên Zalo, vai trò.",
  "parameters": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  }
};
