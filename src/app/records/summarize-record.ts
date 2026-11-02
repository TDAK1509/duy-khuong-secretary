import type { ReadingItem } from '../reading/reading.ts';

const CATEGORY_LABELS: Record<ReadingItem['category'], string> = {
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
  maintenanceItem: string | null;
  vehiclePlate: string | null;
  documentNumber: string | null;
  identifiers: string[];
};

export function summarizeRecord(fields: SummaryFields): string {
  const { category, maintenanceItem, vehiclePlate, documentNumber, identifiers } = fields;
  return [
    CATEGORY_LABELS[category] + (maintenanceItem ? `: ${maintenanceItem}` : ''),
    vehiclePlate && `xe ${vehiclePlate}`,
    documentNumber && `số ${documentNumber}`,
    identifiers.length > 0 && `mã ${identifiers.join(', ')}`,
  ]
    .filter(Boolean)
    .join(', ');
}
