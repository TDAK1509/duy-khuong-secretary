import type { ReadingItem } from '../reading/reading.ts';

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
    (documentTitle ?? capitalizeFirstLetter(category)) + (maintenanceItem ? `: ${maintenanceItem}` : ''),
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
