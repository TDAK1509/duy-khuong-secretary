export type SearchCursor = { createdAt: string; id: string };

export function encodeSearchCursor(cursor: SearchCursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`).toString('base64url');
}

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function decodeSearchCursor(text: string): SearchCursor | null {
  const [createdAt, id, ...rest] = Buffer.from(text, 'base64url').toString().split('|');
  const isReadable = createdAt !== undefined && id !== undefined && rest.length === 0;
  if (!isReadable || !ISO_TIME.test(createdAt) || !UUID.test(id) || Number.isNaN(Date.parse(createdAt))) return null;
  return { createdAt, id };
}
