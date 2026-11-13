import { escapeHtml } from '../chatgpt/escape-html.ts';
import { formatCredits, formatUsage, formatUsd } from './format-credits.ts';
import type { Dashboard } from './read-dashboard.ts';
import type { KindUsage } from './read-usage-by-kind.ts';
import type { WorkspaceOverview } from './read-workspace-overview.ts';
import {
  ADMIN_TITLE,
  BALANCE_AND_USAGE_HEADING,
  BALANCE_COLUMN,
  CALLS_COLUMN,
  COST_COLUMN,
  CREDITS_COLUMN,
  DRIFT_WARNING,
  KIND_COLUMN,
  KIND_LABELS,
  CODE_FIELD_LABEL,
  LAST_MONTH_COLUMN,
  LAST_WEEK_COLUMN,
  LOGIN_BUTTON_LABEL,
  LOGIN_INTRO,
  LOGIN_STEP_COPY_CODE,
  LOGIN_STEP_OPEN_CHAT,
  LOGIN_STEP_SEND_COMMAND,
  LOGIN_STEP_SUBMIT,
  TODAY_COLUMN,
  USAGE_BY_KIND_HEADING,
  WORKSPACE_COLUMN,
} from './internal-admin-texts.ts';

const PAGE_STYLE = `
  body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; line-height: 1.5; }
  main { max-width: 72rem; margin: 0 auto; }
  input, button { box-sizing: border-box; width: 100%; max-width: 36rem; min-height: 48px; font-size: 1rem; margin-top: 8px; }
`;

export function renderLoginPage(message: string | null): string {
  return renderDocument(
    [
      `<h1>${ADMIN_TITLE}</h1>`,
      `<p>${LOGIN_INTRO}</p>`,
      `<p>${LOGIN_STEP_OPEN_CHAT}</p>`,
      `<p>${LOGIN_STEP_SEND_COMMAND}</p>`,
      `<p>${LOGIN_STEP_COPY_CODE}</p>`,
      `<p>${LOGIN_STEP_SUBMIT}</p>`,
      ...(message === null ? [] : [`<p role="alert">${message}</p>`]),
      renderCodeForm(),
    ].join('\n'),
  );
}

function renderCodeForm(): string {
  return [
    '<form method="post" action="/admin/login">',
    `<label for="code">${CODE_FIELD_LABEL}</label>`,
    '<input id="code" name="code" type="text" required autocomplete="one-time-code" autocapitalize="characters" spellcheck="false">',
    `<button type="submit">${LOGIN_BUTTON_LABEL}</button>`,
    '</form>',
  ].join('\n');
}

export function renderDashboardPage({ workspaces, usageByKind }: Dashboard): string {
  return renderDocument(
    [
      `<h1>${ADMIN_TITLE}</h1>`,
      `<h2>${BALANCE_AND_USAGE_HEADING}</h2>`,
      renderOverviewTable(workspaces),
      `<h2>${USAGE_BY_KIND_HEADING}</h2>`,
      renderKindTable(usageByKind),
    ].join('\n'),
  );
}

function renderOverviewTable(workspaces: WorkspaceOverview[]): string {
  return [
    '<table>',
    `<tr><th>${WORKSPACE_COLUMN}</th><th>${BALANCE_COLUMN}</th><th>${TODAY_COLUMN}</th><th>${LAST_WEEK_COLUMN}</th><th>${LAST_MONTH_COLUMN}</th></tr>`,
    ...workspaces.map(renderOverviewRow),
    '</table>',
  ].join('\n');
}

function renderOverviewRow(workspace: WorkspaceOverview): string {
  const link = `<a href="/admin/workspaces/${workspace.id}">${escapeHtml(workspace.name)}</a>`;
  const usageCells = [workspace.today, workspace.lastWeek, workspace.lastMonth].map((usage) => `<td>${formatUsage(usage)}</td>`);
  return `<tr><td>${link}</td><td>${formatCredits(workspace.balance)}${workspace.hasDrifted ? ` <strong>${DRIFT_WARNING}</strong>` : ''}</td>${usageCells.join('')}</tr>`;
}

function renderKindTable(usageByKind: KindUsage[]): string {
  return [
    '<table>',
    `<tr><th>${WORKSPACE_COLUMN}</th><th>${KIND_COLUMN}</th><th>${CALLS_COLUMN}</th><th>${CREDITS_COLUMN}</th><th>${COST_COLUMN}</th></tr>`,
    ...usageByKind.map(renderKindRow),
    '</table>',
  ].join('\n');
}

function renderKindRow(usage: KindUsage): string {
  const cells = [escapeHtml(usage.workspaceName), KIND_LABELS[usage.kind], String(usage.calls), formatCredits(usage.credits), formatUsd(usage.costUsd)];
  return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
}

export function renderMessagePage(message: string): string {
  return renderDocument(`<p>${message}</p>`);
}

function renderDocument(content: string): string {
  return [
    '<!doctype html>',
    '<html lang="vi">',
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${ADMIN_TITLE}</title><style>${PAGE_STYLE}</style></head>`,
    `<body><main>${content}</main></body></html>`,
  ].join('\n');
}
