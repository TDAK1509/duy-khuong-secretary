export function normalizeCode(text: string | null): string | null {
  const normalized = (text ?? '').toUpperCase().replace(/[\s.\-_/]/g, '');
  return normalized === '' ? null : normalized;
}

export function normalizeCodeSet(texts: string[]): string[] {
  const codes = texts.map(normalizeCode).filter((code) => code !== null);
  return [...new Set(codes)].sort();
}
