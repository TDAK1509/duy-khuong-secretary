import type { ToolSpec } from '../../../services/chat/chat-service.ts';

const NULLABLE_STRING = { type: ['string', 'null'] };
const COMPANY_NAME_RULE = 'Bỏ chữ "công ty" hoặc "cty" đứng trước tên, ví dụ "công ty TAICERA" ghi là "TAICERA". Khi gọi lại sau khi quản lý chọn một tên công cụ đã liệt kê, chép đúng tên đó.';

export const SAVE_FACT_SPEC: ToolSpec = {
  name: 'save_fact',
  description:
    'Lưu một thông tin cố định do quản lý nêu về một xe, một tài xế hoặc một tuyến (nơi lấy hàng, nơi đổ hàng), ví dụ lương tài xế, cước vận chuyển, chi phí bồi dưỡng, khách hàng, hàng hóa. Thông tin áp dụng cho mọi giấy tờ đã lưu khớp phạm vi. Gọi một lần với mọi giá trị. Cần ít nhất một trong vehicle_plate, driver_member_id, pickup_company, dropoff_company.',
  parameters: {
    type: 'object',
    properties: {
      statement: { type: 'string', description: 'Nguyên văn câu quản lý viết, tối đa 2000 ký tự.' },
      vehicle_plate: { ...NULLABLE_STRING, description: 'Biển số xe theo định dạng Việt Nam, ví dụ 93C04939. null nếu quản lý không nêu xe.' },
      driver_member_id: { ...NULLABLE_STRING, description: 'id của tài xế, lấy từ list_members. null nếu quản lý không nêu tài xế.' },
      pickup_company: { ...NULLABLE_STRING, description: `Tên công ty hoặc nơi lấy hàng như quản lý viết. ${COMPANY_NAME_RULE} null nếu không nêu.` },
      dropoff_company: { ...NULLABLE_STRING, description: `Tên công ty hoặc nơi đổ hàng như quản lý viết. ${COMPANY_NAME_RULE} null nếu không nêu.` },
      values: {
        type: 'array',
        description: 'Mọi giá trị quản lý nêu, mỗi giá trị một mục. Một giá trị là số tiền kèm đơn vị, hoặc là chữ.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Tên giá trị, ví dụ "Lương tài xế", "Cước vận chuyển", "Khách hàng". Tối đa 80 ký tự.' },
            number: { type: ['number', 'null'], description: 'Số tiền theo đồng, ví dụ 500k là 500000. null nếu giá trị là chữ.' },
            unit: { ...NULLABLE_STRING, description: '"đ" cho số tiền mỗi chuyến, "đ/tấn" cho số tiền mỗi tấn. null nếu giá trị là chữ.' },
            text: { ...NULLABLE_STRING, description: 'Giá trị dạng chữ, ví dụ tên khách hàng hoặc hàng hóa. null nếu giá trị là số.' },
          },
          required: ['name', 'number', 'unit', 'text'],
          additionalProperties: false,
        },
      },
    },
    required: ['statement', 'vehicle_plate', 'driver_member_id', 'pickup_company', 'dropoff_company', 'values'],
    additionalProperties: false,
  },
};
