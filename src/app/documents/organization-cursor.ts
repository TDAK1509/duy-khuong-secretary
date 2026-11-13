const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type OrganizationCursor = { name: string; id: string };

export function encodeOrganizationCursor(cursor: OrganizationCursor): string {
  return Buffer.from(JSON.stringify([cursor.name, cursor.id])).toString('base64url');
}

export function decodeOrganizationCursor(text: string): OrganizationCursor | null {
  const parsed = parseJson(Buffer.from(text, 'base64url').toString());
  if (!Array.isArray(parsed) || parsed.length !== 2) return null;
  const [name, id] = parsed as unknown[];
  if (typeof name !== 'string' || typeof id !== 'string' || !UUID.test(id)) return null;
  return { name, id };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
