import type { ReadingItem } from '../reading/reading.ts';

export function formatMissingDetails(items: ReadingItem[]): string {
  const namePaper = items.length > 1;
  const lines = items.flatMap(({ missing_template_fields: missing = [] }, position) =>
    missing.length === 0 ? [] : [formatMissingLine(missing, namePaper ? position + 1 : null)],
  );
  return lines.map((line) => `\n${line}`).join('');
}

function formatMissingLine(missingNames: string[], paperPosition: number | null): string {
  const prefix = paperPosition === null ? '' : `Mục ${paperPosition}: `;
  return `${prefix}Chưa đọc được: ${missingNames.join(', ')}. Lần sau bạn chụp rõ phần này nhé.`;
}
