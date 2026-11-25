import type { ToolSpec } from '../../../services/chat/chat-service.ts';

const JOIN_GOODS_NAMES_SPEC: ToolSpec = {
  name: 'join_goods_names',
  description:
    'Gộp nhiều cách viết tên hàng thành một tên hiển thị, ví dụ "Than Da", "Than" và "Than Đá" đều hiển thị là "Than đá". Báo cáo chuyến và việc ghép phiếu trong báo cáo chuyến dùng tên hiển thị cho cả giấy tờ đã lưu và giấy tờ lưu sau. Giấy tờ đã lưu vẫn giữ tên in trên giấy. Một cách viết khớp cả tên hàng, không khớp một phần, không phân biệt dấu và chữ hoa. Gộp lại một cách viết đã gộp thì thay tên hiển thị của nó.',
  parameters: {
    type: 'object',
    properties: {
      written_names: {
        type: 'array',
        items: { type: 'string', description: 'Một cách viết tên hàng, chép đúng từ tin nhắn của quản lý. Tối đa 200 ký tự.' },
        description: 'Các cách viết tên hàng cần gộp, chép đúng từ tin nhắn của quản lý. Tối đa 20 cách viết.',
      },
      shown_name: { type: 'string', description: 'Tên hiển thị, chép đúng từ tin nhắn của quản lý. Tối đa 80 ký tự.' },
    },
    required: ['written_names', 'shown_name'],
    additionalProperties: false,
  },
};

const LIST_GOODS_NAMES_SPEC: ToolSpec = {
  name: 'list_goods_names',
  description: 'Liệt kê các cách viết tên hàng đã gộp bằng join_goods_names, cũ nhất trước. Mỗi dòng có cách viết, tên hiển thị và tên người gộp.',
  parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
};

const REMOVE_GOODS_NAME_SPEC: ToolSpec = {
  name: 'remove_goods_name',
  description: 'Bỏ gộp một cách viết tên hàng đã gộp: báo cáo chuyến hiển thị lại tên in trên giấy cho cách viết đó. Các cách viết khác không đổi. Gộp lại được bằng join_goods_names.',
  parameters: {
    type: 'object',
    properties: { written_name: { type: 'string', description: 'Cách viết cần bỏ gộp, chép đúng từ tin nhắn của quản lý. Không phân biệt dấu và chữ hoa.' } },
    required: ['written_name'],
    additionalProperties: false,
  },
};

export const GOODS_NAME_TOOLS: ToolSpec[] = [JOIN_GOODS_NAMES_SPEC, LIST_GOODS_NAMES_SPEC, REMOVE_GOODS_NAME_SPEC];
