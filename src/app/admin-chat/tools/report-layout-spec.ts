const LAYOUT_OBJECT = {
  type: 'object',
  properties: {
    sort: {
      type: 'array',
      description: 'Tối đa 3 khóa sắp xếp, khóa đầu quan trọng nhất. Ô trống luôn xếp cuối.',
      items: {
        type: 'object',
        properties: {
          column: { type: 'integer', description: 'Số thứ tự cột, bắt đầu từ 0.' },
          direction: { type: 'string', enum: ['asc', 'desc'], description: 'asc tăng dần, desc giảm dần.' },
        },
        required: ['column', 'direction'],
        additionalProperties: false,
      },
    },
    group_by: { type: ['integer', 'null'], description: 'Số thứ tự cột để nhóm dòng (ví dụ cột biển số khi báo cáo theo từng xe), mỗi nhóm có một dòng tổng. null nếu không nhóm. Không dùng cột tiền, kg, tấn hay lít.' },
    totals: {
      type: ['array', 'null'],
      items: { type: 'integer' },
      description: 'Số thứ tự các cột cần cộng tổng, chỉ cột tiền (vnd), kg, tấn hoặc lít. null để cộng mọi cột như vậy.',
    },
    summary: {
      type: ['array', 'null'],
      description: 'Tối đa 4 con số máy chủ tự tính, hiện trên đầu báo cáo, hoặc null. Chọn 2 đến 4 con số người đọc muốn xem trước: số tiền được hỏi, số chuyến, số xe hoặc số tuyến.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Nhãn ngắn, tối đa 40 ký tự, ví dụ "Tổng lương chuyến", "Số chuyến", "Số xe".' },
          measure: { type: 'string', enum: ['sum', 'count', 'count_distinct'], description: 'sum: cộng một cột tiền (vnd), kg, tấn hoặc lít. count: đếm số dòng. count_distinct: đếm số giá trị khác nhau của một cột, ví dụ số xe.' },
          column: { type: ['integer', 'null'], description: 'Số thứ tự cột cho sum và count_distinct. null cho count.' },
        },
        required: ['label', 'measure', 'column'],
        additionalProperties: false,
      },
    },
    subtitle: { type: ['string', 'null'], description: 'Một dòng phụ đề, tối đa 120 ký tự: khoảng thời gian và ngày dùng để lọc, ví dụ "Tháng 11/2026, theo ngày lấy hàng". Không ghi con số vào đây. Với báo cáo chuyến, máy chủ tự ghi khoảng ngày, chỉ cần ghi phần còn lại.' },
  },
  required: ['sort', 'group_by', 'totals', 'summary', 'subtitle'],
  additionalProperties: false,
};

export const REPORT_LAYOUT_PROPERTY = {
  description:
    'Cách sắp xếp và nhóm các dòng cho câu hỏi này, hoặc null để giữ thứ tự dòng. Cột ghi bằng số thứ tự, bắt đầu từ 0, theo đúng thứ tự trong columns.',
  anyOf: [LAYOUT_OBJECT, { type: 'null' }],
};
