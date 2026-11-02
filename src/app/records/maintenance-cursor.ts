export type MaintenanceCursor = { plate: string; maintenanceItem: string };

export function encodeMaintenanceCursor(cursor: MaintenanceCursor): string {
  return Buffer.from(`${cursor.plate}|${cursor.maintenanceItem}`).toString('base64url');
}

export function decodeMaintenanceCursor(text: string): MaintenanceCursor | null {
  const decoded = Buffer.from(text, 'base64url').toString();
  const separatorIndex = decoded.indexOf('|');
  if (separatorIndex <= 0 || separatorIndex === decoded.length - 1) return null;
  return { plate: decoded.slice(0, separatorIndex), maintenanceItem: decoded.slice(separatorIndex + 1) };
}
