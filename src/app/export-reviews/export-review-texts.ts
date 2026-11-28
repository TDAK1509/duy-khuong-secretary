export const NO_CHANGE_TEXT = 'File này không đổi dòng dữ liệu nào so với bản Trợ lý đã xuất. Chưa lưu gì.';

export const STRUCTURE_CHANGED_TEXT = 'File này đã thêm, xóa hoặc đổi cấu trúc dòng/cột so với bản Trợ lý đã xuất. Tôi chưa lưu gì. Hãy giữ nguyên dòng và cột, chỉ sửa giá trị trong ô rồi gửi lại.';

export function formatChangesFound(count: number): string {
  return `Tôi tìm thấy ${count} ô đã đổi trong file Trợ lý đã xuất. Tôi chưa lưu gì. Hãy xác nhận nguyên nhân tôi nêu cho từng thay đổi: sai ở riêng giấy tờ đó, hay là thông tin lâu dài cho mọi chuyến phù hợp.`;
}
