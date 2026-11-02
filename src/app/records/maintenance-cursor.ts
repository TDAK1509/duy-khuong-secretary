export type MaintenanceCursor = { plate: string; maintenanceItem: string };

export function encodeMaintenanceCursor(cursor: MaintenanceCursor): string {
  return Buffer.from(JSON.stringify([cursor.plate, cursor.maintenanceItem])).toString('base64url');
}

export function decodeMaintenanceCursor(text: string): MaintenanceCursor | null {
  const parsed = parseJson(Buffer.from(text, 'base64url').toString());
  if (!Array.isArray(parsed) || parsed.length !== 2) return null;
  const [plate, maintenanceItem] = parsed as unknown[];
  if (typeof plate !== 'string' || typeof maintenanceItem !== 'string') return null;
  return { plate, maintenanceItem };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
