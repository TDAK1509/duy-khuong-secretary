export type OrganizationCursor = { name: string; id: string };

export function encodeOrganizationCursor(cursor: OrganizationCursor): string {
  return Buffer.from(JSON.stringify([cursor.name, cursor.id])).toString('base64url');
}
