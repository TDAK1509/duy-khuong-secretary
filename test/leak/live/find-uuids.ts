const ANY_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function findUuids(text: string): string[] {
  return text.match(ANY_UUID) ?? [];
}
