export type BackfillCounts = { updated: number; unmatched: number; skipped: number; failed: number };

export type BackfillSummary = { templateName: string; total: number; processed: number; counts: BackfillCounts };

export const OUT_OF_CREDIT_STOP_REASON = 'nhóm đã hết credit';

export function formatBackfillDone({ templateName, total, counts }: BackfillSummary): string {
  return `Đã đọc lại ${total} phiếu theo mẫu "${templateName}": ${describeCounts(counts)}.`;
}

export function formatBackfillStopped(summary: BackfillSummary, stopReason: string): string {
  const notRead = summary.total - summary.processed;
  return `Đã dừng đọc lại phiếu theo mẫu "${summary.templateName}" vì ${stopReason}. Đã đọc lại ${summary.processed} phiếu: ${describeCounts(summary.counts)}. Còn ${notRead} phiếu chưa đọc lại.`;
}

function describeCounts({ updated, unmatched, skipped, failed }: BackfillCounts): string {
  return `${updated} cập nhật, ${unmatched} không khớp mẫu, ${skipped} bỏ qua (thiếu ảnh hoặc giấy tờ không còn), ${failed} lỗi`;
}
