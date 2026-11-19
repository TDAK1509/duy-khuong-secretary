const LAYOUT_OBJECT = {
  type: 'object',
  properties: {
    sort: {
      type: 'array',
      description: 'Tối đa 3 khóa sắp xếp, khóa đầu quan trọng nhất. Chỉ dùng khi quản lý yêu cầu thứ tự. Để trống thì máy chủ xếp theo cột ngày đầu tiên tăng dần. Ô trống luôn xếp cuối.',
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
  },
  required: ['sort'],
  additionalProperties: false,
};

export const REPORT_LAYOUT_PROPERTY = {
  description: 'Thứ tự dòng, hoặc null để dùng thứ tự mặc định. Cột ghi bằng số thứ tự, bắt đầu từ 0, theo đúng thứ tự trong columns.',
  anyOf: [LAYOUT_OBJECT, { type: 'null' }],
};
