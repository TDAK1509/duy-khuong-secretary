import type { ToolSpec } from '../../../services/chat/chat-service.ts';

const NULLABLE_STRING = { type: ['string', 'null'] };

export const PROPOSE_DOCUMENT_TEMPLATES_SPEC: ToolSpec = {
  name: 'propose_document_templates',
  description:
    'Đề xuất mẫu giấy tờ từ các giấy tờ đã lưu của nhóm (không tính giấy tờ lưu từ file bảng tính). Không có paper_id: trả về tối đa 5 nhóm giấy tờ nhiều nhất theo bên phát hành và loại giấy tờ, mỗi nhóm có số giấy tờ, số giấy tờ lấy hàng (dispatch), đổ hàng (receipt) và chưa rõ (none), và từng thông tin kèm kiểu, đơn vị và số giấy tờ có thông tin đó. Có paper_id: đề xuất từ đúng một giấy tờ đã lưu. Mỗi nhóm cho biết nếu lưu mẫu thì sẽ đọc lại bao nhiêu giấy tờ đã lưu (papers_to_reread) và khoảng bao nhiêu credit (credits_estimate, chỉ là ước tính). Chỉ đề xuất, chưa lưu gì.',
  parameters: {
    type: 'object',
    properties: {
      paper_id: { ...NULLABLE_STRING, description: 'id của một giấy tờ đã lưu (id từ list_documents hoặc từ search_records) khi quản lý chọn một giấy tờ làm mẫu, ví dụ "lấy phiếu vừa gửi làm mẫu". null để đề xuất từ mọi giấy tờ đã lưu.' },
    },
    required: ['paper_id'],
    additionalProperties: false,
  },
};

export const SAVE_DOCUMENT_TEMPLATE_SPEC: ToolSpec = {
  name: 'save_document_template',
  description:
    'Lưu một mẫu giấy tờ của công ty sau khi quản lý đã xác nhận bản nháp: tên mẫu, loại giấy tờ, bên phát hành, lấy hàng hay đổ hàng, mô tả và các trường cần lưu. Từ khi lưu, giấy tờ mới gửi vào khớp mẫu được lưu theo loại, giai đoạn và các trường của mẫu. Mẫu mới, hoặc mẫu đổi loại, giai đoạn, công ty phát hành hoặc trường, còn đọc lại ở nền các giấy tờ đã lưu còn ảnh; kết quả cho biết đã bắt đầu đọc lại chưa và bao nhiêu giấy tờ, và hệ thống nhắn kết quả riêng sau. Cùng tên mẫu (không phân biệt dấu và chữ hoa) thì cập nhật mẫu đó và thay toàn bộ các trường. Tối đa 50 mẫu mỗi nhóm và 20 trường mỗi mẫu. Kết quả cho biết công ty phát hành đã khớp công ty đã lưu nào, null nếu không khớp.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Tên mẫu quản lý đặt, tối đa 80 ký tự, ví dụ "phiếu cân nhà máy A".' },
      kind: { type: 'string', description: 'Loại giấy tờ lưu trên giấy tờ khớp mẫu, ngắn, chữ thường, tối đa 60 ký tự, ví dụ "phiếu cân nhà máy".' },
      issuer_company: { ...NULLABLE_STRING, description: 'Tên công ty phát hành mẫu giấy tờ như quản lý viết, bỏ chữ "công ty" hoặc "cty" đứng trước tên. null nếu không nêu.' },
      stage: { type: ['string', 'null'], enum: ['dispatch', 'receipt', null], description: 'dispatch: giấy tờ lúc hàng rời nơi lấy hàng. receipt: giấy tờ lúc hàng đến nơi đổ hàng. null nếu không rõ.' },
      description: { type: 'string', description: 'Cách nhận ra mẫu giấy tờ này, tối đa 200 ký tự. Chuỗi rỗng nếu không có.' },
      fields: {
        type: 'array',
        description: 'Các trường cần lưu, tối đa 20, chỉ các trường mà giấy tờ thật sự in. Không thêm trường giấy tờ không có.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Tên trường, tối đa 60 ký tự, ví dụ "Hàng hóa", "Trọng lượng hàng", "Thời điểm cân lần 1".' },
            type: { type: 'string', enum: ['text', 'number', 'date'], description: 'text: chữ. number: số. date: ngày hoặc giờ.' },
            unit: { type: ['string', 'null'], enum: ['kg', 'l', 'km', 'vnd', null], description: 'Đơn vị của trường kiểu number: kg, l, km hoặc vnd. null nếu không phải kiểu number hoặc không có đơn vị chuẩn.' },
            required: { type: 'boolean', description: 'true nếu quản lý nói trường này bắt buộc.' },
          },
          required: ['name', 'type', 'unit', 'required'],
          additionalProperties: false,
        },
      },
    },
    required: ['name', 'kind', 'issuer_company', 'stage', 'description', 'fields'],
    additionalProperties: false,
  },
};

export const LIST_DOCUMENT_TEMPLATES_SPEC: ToolSpec = {
  name: 'list_document_templates',
  description: 'Liệt kê các mẫu giấy tờ đã lưu của nhóm: tên, loại giấy tờ, công ty phát hành, lấy hàng hay đổ hàng, mô tả, các trường, số lần sửa và số giấy tờ đã khớp mẫu.',
  parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
};

export const DELETE_DOCUMENT_TEMPLATE_SPEC: ToolSpec = {
  name: 'delete_document_template',
  description: 'Xóa hẳn một mẫu giấy tờ theo tên mẫu (không phân biệt dấu và chữ hoa). Giấy tờ mới không còn được đọc theo mẫu này. Giấy tờ đã lưu vẫn giữ nguyên loại, giai đoạn và thông tin. Không hoàn tác được.',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Tên mẫu cần xóa, chép đúng từ list_document_templates.' } },
    required: ['name'],
    additionalProperties: false,
  },
};

export const DOCUMENT_TEMPLATE_TOOLS: ToolSpec[] = [
  PROPOSE_DOCUMENT_TEMPLATES_SPEC,
  SAVE_DOCUMENT_TEMPLATE_SPEC,
  LIST_DOCUMENT_TEMPLATES_SPEC,
  DELETE_DOCUMENT_TEMPLATE_SPEC,
];
