import type { ReadingItem } from '../reading/reading.ts';

const CATEGORY_LABELS: Record<string, string | undefined> = {
  fuel: 'Đổ xăng dầu',
  toll: 'Phí cầu đường',
  delivery_pickup: 'Nhận hàng',
  delivery_dropoff: 'Giao hàng',
  maintenance: 'Bảo dưỡng',
  certificate: 'Giấy chứng nhận',
  other: 'Giấy tờ khác',
};

export type SummaryFields = {
  category: ReadingItem['category'];
  documentTitle: string | null;
  maintenanceItem: string | null;
  vehiclePlate: string | null;
  documentNumber: string | null;
  identifiers: string[];
};

export function summarizeRecord(fields: SummaryFields): string {
  const { category, documentTitle, maintenanceItem, vehiclePlate, documentNumber, identifiers } = fields;
  return [
    (documentTitle ?? CATEGORY_LABELS[category] ?? capitalizeFirstLetter(category)) + (maintenanceItem ? `: ${maintenanceItem}` : ''),
    vehiclePlate && `xe ${vehiclePlate}`,
    documentNumber && `số ${documentNumber}`,
    identifiers.length > 0 && `mã ${identifiers.join(', ')}`,
  ]
    .filter(Boolean)
    .join(', ');
}

function capitalizeFirstLetter(text: string): string {
  return text.charAt(0).toLocaleUpperCase('vi') + text.slice(1);
}
