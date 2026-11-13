import { ADMIN_TITLE, EMPTY_TABLE_TEXT } from './internal-admin-texts.ts';

const PAGE_STYLE = `
  :root {
    color-scheme: light dark;
    --page: rgb(244 246 249); --card: rgb(255 255 255); --text: rgb(29 36 51); --muted: rgb(93 103 121); --line: rgb(227 231 238); --head: rgb(247 249 252);
    --accent: rgb(15 118 110); --accent-strong: rgb(11 95 88); --accent-soft: rgb(230 244 242);
    --alert-text: rgb(155 28 28); --alert-back: rgb(253 236 236); --warn-text: rgb(138 75 8); --warn-back: rgb(255 243 214);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --page: rgb(17 21 28); --card: rgb(26 32 42); --text: rgb(230 233 239); --muted: rgb(154 164 181); --line: rgb(43 51 64); --head: rgb(32 40 53);
      --accent: rgb(43 179 163); --accent-strong: rgb(95 208 194); --accent-soft: rgb(22 49 46);
      --alert-text: rgb(255 180 180); --alert-back: rgb(58 29 29); --warn-text: rgb(255 212 138); --warn-back: rgb(58 46 20);
    }
  }
  html, body, body * { box-sizing: border-box; }
  body { margin: 0; background: var(--page); color: var(--text); font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 76rem; margin: 0 auto; padding: 28px 20px 48px; }
  h1 { margin: 0 0 24px; font-size: 1.6rem; font-weight: 650; letter-spacing: -0.01em; }
  h2 { margin: 0 0 14px; font-size: 1.05rem; font-weight: 600; }
  a { color: var(--accent); font-weight: 550; text-decoration: none; }
  a:hover { color: var(--accent-strong); text-decoration: underline; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 20px 22px; margin-bottom: 20px; box-shadow: 0 1px 2px rgb(16 24 40 / 6%); }
  .columns { display: grid; gap: 20px; grid-template-columns: minmax(0, 1fr); }
  .columns > section { margin-bottom: 0; }
  @media (min-width: 60rem) { .columns { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); margin-bottom: 20px; } }
  .table-scroll { overflow-x: auto; margin: 0 -22px; padding: 0 22px; }
  @media (max-width: 40rem) { main { padding: 20px 12px 40px; } section { padding: 16px 14px; } .table-scroll { margin: 0 -14px; padding: 0 14px; } }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th { background: var(--head); color: var(--muted); font-size: 0.78rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  td { padding: 11px 12px; border-bottom: 1px solid var(--line); vertical-align: top; white-space: nowrap; }
  .additions td:nth-child(5), .history td:nth-child(7) { white-space: normal; min-width: 8rem; }
  tr:last-child td { border-bottom: 0; }
  tbody tr:hover td { background: var(--accent-soft); }
  .overview td:nth-child(n+2), .overview th:nth-child(n+2),
  .kinds td:nth-child(n+3), .kinds th:nth-child(n+3),
  .additions td:nth-child(3), .additions th:nth-child(3),
  .history td:nth-child(3), .history th:nth-child(3), .history td:nth-child(4), .history th:nth-child(4),
  .history td:nth-child(5), .history th:nth-child(5), .history td:nth-child(8), .history th:nth-child(8) { text-align: right; white-space: nowrap; }
  td strong { display: block; width: fit-content; margin: 6px 0 0 auto; padding: 2px 8px; border-radius: 999px; background: var(--warn-back); color: var(--warn-text); font-size: 0.78rem; font-weight: 600; }
  .empty { margin: 0; padding: 18px; border: 1px dashed var(--line); border-radius: 10px; color: var(--muted); text-align: center; }
  [role="alert"] { margin: 0 0 16px; padding: 12px 14px; border-radius: 10px; background: var(--alert-back); color: var(--alert-text); font-weight: 550; }
  form { display: grid; gap: 6px; }
  label { margin-top: 10px; font-size: 0.88rem; font-weight: 600; color: var(--muted); }
  input, select { width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); color: var(--text); font: inherit; }
  input:focus, select:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
  button { margin-top: 16px; min-height: 46px; padding: 0 20px; border: 0; border-radius: 10px; background: var(--accent); color: rgb(255 255 255); font: inherit; font-weight: 600; cursor: pointer; }
  button:hover { background: var(--accent-strong); }
  .narrow { max-width: 30rem; margin: 6vh auto 0; }
  .narrow h1 { font-size: 1.4rem; margin-bottom: 8px; }
  .lead { margin: 0 0 18px; color: var(--muted); }
  .steps { margin: 0 0 8px; padding: 14px 16px; border-radius: 10px; background: var(--accent-soft); }
  .steps p { margin: 4px 0; }
  .back { margin: 4px 0 0; }
`;

export function renderMessagePage(message: string): string {
  return renderDocument(`<section class="narrow"><p>${message}</p><p class="back"><a href="/admin">${ADMIN_TITLE}</a></p></section>`);
}

export function renderDocument(content: string): string {
  return [
    '<!doctype html>',
    '<html lang="vi">',
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${ADMIN_TITLE}</title><style>${PAGE_STYLE}</style></head>`,
    `<body><main>${content}</main></body></html>`,
  ].join('\n');
}

export function renderTable(tableClass: string, columns: string[], rows: string[][]): string {
  if (rows.length === 0) return `<p class="empty">${EMPTY_TABLE_TEXT}</p>`;
  return [
    `<div class="table-scroll"><table class="${tableClass}">`,
    `<thead><tr>${columns.map((column) => `<th>${column}</th>`).join('')}</tr></thead>`,
    '<tbody>',
    ...rows.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`),
    '</tbody></table></div>',
  ].join('\n');
}
