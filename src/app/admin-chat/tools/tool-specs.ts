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
  "description": "Liệt kê mọi người trong nhóm: id, tên trong nhóm, vai trò, ngày vào nhóm.",
  "parameters": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  }
};

export const CREATE_INVITE_SPEC: ToolSpec = {
  "name": "create_invite",
  "description": "Tạo mã mời dùng một lần để một người vào nhóm với tên và vai trò cho trước. Mã hết hạn sau 7 ngày. Người được mời mở Zalo của Trợ lý rồi nhắn mã này.",
  "parameters": {
    "type": "object",
    "properties": {
      "display_name": {
        "type": "string",
        "description": "Tên của người được mời trong nhóm, tối đa 60 ký tự, ví dụ \"Hùng\"."
      },
      "role": {
        "type": "string",
        "enum": [
          "member",
          "admin"
        ],
        "description": "member: thành viên, trò chuyện và xem dữ liệu của chính mình. admin: quản lý, xem dữ liệu công việc của nhóm và dùng công cụ quản lý."
      }
    },
    "required": [
      "display_name",
      "role"
    ],
    "additionalProperties": false
  }
};

export const REMOVE_MEMBER_SPEC: ToolSpec = {
  "name": "remove_member",
  "description": "Xóa một người khỏi nhóm. Lấy id từ list_members. Dữ liệu người đó đã gửi vẫn được giữ. Không xóa được chính mình.",
  "parameters": {
    "type": "object",
    "properties": {
      "member_id": {
        "type": "string",
        "description": "id của người cần xóa, lấy từ list_members."
      }
    },
    "required": [
      "member_id"
    ],
    "additionalProperties": false
  }
};

export const MAINTENANCE_STATUS_SPEC: ToolSpec = {
  "name": "maintenance_status",
  "description": "Liệt kê lần bảo dưỡng gần nhất của từng xe (theo biển số) cho từng bộ phận, ví dụ dầu máy, lốp, má phanh. Chỉ đọc dữ liệu loại bảo dưỡng. Trả về tối đa 50 dòng mỗi trang; nếu next_cursor khác null, gọi lại với cursor đó.",
  "parameters": {
    "type": "object",
    "properties": {
      "plate": {
        "type": [
          "string",
          "null"
        ],
        "description": "Biển số xe cần xem. null để xem mọi xe."
      },
      "maintenance_item": {
        "type": [
          "string",
          "null"
        ],
        "description": "Chỉ lấy một bộ phận, ví dụ \"dầu máy\". null để lấy mọi bộ phận."
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
      "plate",
      "maintenance_item",
      "cursor"
    ],
    "additionalProperties": false
  }
};

export const ATTACH_PHOTOS_SPEC: ToolSpec = {
  "name": "attach_photos",
  "description": "Gửi kèm ảnh gốc của các mục dữ liệu ngay sau câu trả lời, mỗi ảnh một tin nhắn. Lấy id từ kết quả search_records. Tối đa 4 ảnh. Mục không có ảnh hoặc không được phép xem sẽ bị bỏ qua.",
  "parameters": {
    "type": "object",
    "properties": {
      "record_ids": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "id của các mục cần gửi ảnh."
      }
    },
    "required": [
      "record_ids"
    ],
    "additionalProperties": false
  }
};

export const LIST_SOURCES_SPEC: ToolSpec = {
  "name": "list_sources",
  "description": "Tìm tin gốc của các mục dữ liệu: ai gửi, gửi lúc nào (giờ Việt Nam), gửi ảnh hay tin nhắn, và ngày trên giấy tờ. Lấy record_ids từ search_records. Tối đa 5 tin gốc mỗi lần gọi, theo thứ tự id. Hệ thống tự gửi một thẻ nguồn có nguyên văn tin nhắn cho mỗi tin gốc ngay sau câu trả lời. left_out đếm số id không có trong kết quả. Nếu quoted là true, thẻ nguồn trích lại tin gốc trong cuộc trò chuyện này.",
  "parameters": {
    "type": "object",
    "properties": {
      "record_ids": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "id các mục cần xem nguồn, lấy từ search_records."
      }
    },
    "required": [
      "record_ids"
    ],
    "additionalProperties": false
  }
};

export const CREATE_SCHEDULED_TASK_SPEC: ToolSpec = {
  "name": "create_scheduled_task",
  "description": "Đặt lịch để Trợ lý tự làm một việc vào giờ đã hẹn và gửi kết quả cho quản lý. Giờ là giờ Việt Nam. Lịch được lưu và bắt đầu chạy ngay.",
  "parameters": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string",
        "description": "Tên ngắn của lịch, tối đa 80 ký tự, ví dụ \"Báo cáo hằng ngày\"."
      },
      "instruction": {
        "type": "string",
        "description": "Yêu cầu đầy đủ mà Trợ lý sẽ làm mỗi lần chạy, tối đa 2000 ký tự. Phải tự hiểu được mà không cần cuộc trò chuyện."
      },
      "repeat": {
        "type": "string",
        "enum": [
          "once",
          "daily",
          "weekly",
          "monthly"
        ],
        "description": "once: một lần. daily: hằng ngày. weekly: hằng tuần. monthly: hằng tháng."
      },
      "run_once_at": {
        "type": [
          "string",
          "null"
        ],
        "description": "Chỉ dùng khi repeat là once. Thời điểm chạy, dạng YYYY-MM-DD HH:mm. null với các loại khác."
      },
      "time_of_day": {
        "type": [
          "string",
          "null"
        ],
        "description": "Dùng khi repeat là daily, weekly hoặc monthly. Giờ chạy, dạng HH:mm. null khi repeat là once."
      },
      "weekday": {
        "type": [
          "integer",
          "null"
        ],
        "description": "Chỉ dùng khi repeat là weekly. 1 là thứ Hai, 7 là Chủ nhật. null với các loại khác."
      },
      "day_of_month": {
        "type": [
          "integer",
          "null"
        ],
        "description": "Chỉ dùng khi repeat là monthly. Ngày trong tháng, từ 1 đến 28. null với các loại khác."
      }
    },
    "required": [
      "title",
      "instruction",
      "repeat",
      "run_once_at",
      "time_of_day",
      "weekday",
      "day_of_month"
    ],
    "additionalProperties": false
  }
};

export const LIST_SCHEDULED_TASKS_SPEC: ToolSpec = {
  "name": "list_scheduled_tasks",
  "description": "Liệt kê các lịch tự động đang chạy. scope \"mine\": lịch do quản lý đang trò chuyện đặt. scope \"all\": mọi lịch trong nhóm, kèm tên người đặt.",
  "parameters": {
    "type": "object",
    "properties": {
      "scope": {
        "type": "string",
        "enum": [
          "mine",
          "all"
        ],
        "description": "\"mine\" cho lịch của quản lý đang trò chuyện. \"all\" khi quản lý hỏi lịch của cả nhóm hoặc của quản lý khác."
      }
    },
    "required": [
      "scope"
    ],
    "additionalProperties": false
  }
};

export const CANCEL_SCHEDULED_TASK_SPEC: ToolSpec = {
  "name": "cancel_scheduled_task",
  "description": "Hủy một lịch tự động trong nhóm, kể cả lịch do quản lý khác đặt. Lấy id từ list_scheduled_tasks.",
  "parameters": {
    "type": "object",
    "properties": {
      "task_id": {
        "type": "string",
        "description": "id của lịch cần hủy."
      }
    },
    "required": [
      "task_id"
    ],
    "additionalProperties": false
  }
};
