export function normalizeCode(text: string | null): string | null {
  const normalized = (text ?? '').toUpperCase().replace(/[\s.\-_/]/g, '');
  return normalized === '' ? null : normalized;
}

export function normalizeCodeSet(texts: string[]): string[] {
  const codes = texts.map(normalizeCode).filter((code) => code !== null);
  return [...new Set(codes)].sort();
}

export function toAccentFreeForm(text: string | null): string | null {
  const normalized = (text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return normalized === '' ? null : normalized;
}
