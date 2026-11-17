import type { ToolSpec } from '../../../services/chat/chat-service.ts';

export const EXPORT_REPORT_XLSX_SPEC: ToolSpec = {
  name: 'export_report_xlsx',
  description:
    'Lưu một bảng báo cáo thành file Excel (.xlsx) và trả về đường dẫn tải xuống có hiệu lực 24 giờ. Dùng khi câu trả lời có một bảng hơn 5 dòng. Mọi số trong bảng phải chép đúng từ kết quả công cụ trong lượt này, không ước lượng.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Tiêu đề bảng, ví dụ "Tổng trọng lượng hàng giao theo công ty, tháng 10 và 11/2026".' },
      columns: {
        type: 'array',
        description: 'Các cột theo thứ tự, tối đa 50 cột.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Tên cột, ghi đơn vị trong tên, ví dụ "Trọng lượng (kg)".' },
            type: { type: 'string', enum: ['number', 'text'], description: 'number cho cột số, text cho cột chữ.' },
          },
          required: ['name', 'type'],
          additionalProperties: false,
        },
      },
      rows: {
        type: 'array',
        description: 'Các dòng, tối đa 5000 dòng. Mỗi dòng là danh sách ô theo đúng thứ tự cột. Ô số ghi số không có dấu phân cách, ví dụ 654260. Ô trống ghi null.',
        items: { type: 'array', items: { type: ['number', 'string', 'null'] } },
      },
    },
    required: ['title', 'columns', 'rows'],
    additionalProperties: false,
  },
};
