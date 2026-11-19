export const REPORT_LAYOUT_PROPERTY = {
  type: ['object', 'null'],
  description:
    'Cách sắp xếp và nhóm các dòng cho câu hỏi này, hoặc null để giữ thứ tự dòng. Cột ghi bằng số thứ tự, bắt đầu từ 0, theo đúng thứ tự trong columns.',
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
  },
  required: ['sort', 'group_by', 'totals'],
  additionalProperties: false,
};
