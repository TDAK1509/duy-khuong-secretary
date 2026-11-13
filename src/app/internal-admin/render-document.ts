import { ADMIN_TITLE } from './internal-admin-texts.ts';

const PAGE_STYLE = `
  body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; line-height: 1.5; }
  main { max-width: 72rem; margin: 0 auto; }
  input, button { box-sizing: border-box; width: 100%; max-width: 36rem; min-height: 48px; font-size: 1rem; margin-top: 8px; }
`;

export function renderDocument(content: string): string {
  return [
    '<!doctype html>',
    '<html lang="vi">',
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${ADMIN_TITLE}</title><style>${PAGE_STYLE}</style></head>`,
    `<body><main>${content}</main></body></html>`,
  ].join('\n');
}

export function renderMessagePage(message: string): string {
  return renderDocument(`<p>${message}</p>`);
}

export function renderTable(columns: string[], rows: string[][]): string {
  return [
    '<table>',
    `<tr>${columns.map((column) => `<th>${column}</th>`).join('')}</tr>`,
    ...rows.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`),
    '</table>',
  ].join('\n');
}
