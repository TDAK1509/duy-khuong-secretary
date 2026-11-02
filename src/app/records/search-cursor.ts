export type SearchCursor = { createdAt: string; id: string };

export function encodeSearchCursor(cursor: SearchCursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`).toString('base64url');
}
