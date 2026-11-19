import type { ToolSpec } from '../../../services/chat/chat-service.ts';
import { REPORT_LAYOUT_PROPERTY } from './report-layout-spec.ts';

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
            unit: {
              type: ['string', 'null'],
              enum: ['vnd', 'kg', 'ton', 'liter', 'rate', 'number', null],
              description: 'Đơn vị của cột số: vnd cho tiền đồng, kg cho ki-lô-gam, ton cho tấn, liter cho lít, rate cho đơn giá (đ/tấn, đ/chuyến…), number cho số khác. Cột vnd, kg, ton, liter có dòng "Tổng cộng". null cho cột chữ.',
            },
          },
          required: ['name', 'type', 'unit'],
          additionalProperties: false,
        },
      },
      layout: REPORT_LAYOUT_PROPERTY,
      rows: {
        type: 'array',
        description: 'Các dòng, tối đa 5000 dòng. Mỗi dòng là danh sách ô theo đúng thứ tự cột, mỗi ô là chữ. Ô của cột số ghi số không có dấu phân cách hàng nghìn, dùng dấu chấm cho phần thập phân, ví dụ "654260" hoặc "56.38". Ô trống ghi null.',
        items: { type: 'array', items: { type: ['string', 'null'] } },
      },
    },
    required: ['title', 'columns', 'rows', 'layout'],
    additionalProperties: false,
  },
};
