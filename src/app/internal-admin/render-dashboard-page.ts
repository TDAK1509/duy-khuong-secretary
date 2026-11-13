import { escapeHtml } from '../chatgpt/escape-html.ts';
import { formatCredits, formatUsage, formatUsd } from './format-credits.ts';
import type { Dashboard } from './read-dashboard.ts';
import type { KindUsage } from './read-usage-by-kind.ts';
import type { WorkspaceOverview } from './read-workspace-overview.ts';
import { renderDocument, renderTable } from './render-document.ts';
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
  LAST_MONTH_COLUMN,
  LAST_WEEK_COLUMN,
  TODAY_COLUMN,
  USAGE_BY_KIND_HEADING,
  WORKSPACE_COLUMN,
} from './internal-admin-texts.ts';

export function renderDashboardPage({ workspaces, usageByKind }: Dashboard): string {
  return renderDocument(
    [
      `<h1>${ADMIN_TITLE}</h1>`,
      `<h2>${BALANCE_AND_USAGE_HEADING}</h2>`,
      renderTable([WORKSPACE_COLUMN, BALANCE_COLUMN, TODAY_COLUMN, LAST_WEEK_COLUMN, LAST_MONTH_COLUMN], workspaces.map(listOverviewCells)),
      `<h2>${USAGE_BY_KIND_HEADING}</h2>`,
      renderTable([WORKSPACE_COLUMN, KIND_COLUMN, CALLS_COLUMN, CREDITS_COLUMN, COST_COLUMN], usageByKind.map(listKindCells)),
    ].join('\n'),
  );
}

function listOverviewCells(workspace: WorkspaceOverview): string[] {
  const link = `<a href="/admin/workspaces/${workspace.id}">${escapeHtml(workspace.name)}</a>`;
  const balance = workspace.hasDrifted ? `${formatCredits(workspace.balance)} <strong>${DRIFT_WARNING}</strong>` : formatCredits(workspace.balance);
  return [link, balance, ...[workspace.today, workspace.lastWeek, workspace.lastMonth].map(formatUsage)];
}

function listKindCells(usage: KindUsage): string[] {
  return [escapeHtml(usage.workspaceName), KIND_LABELS[usage.kind], String(usage.calls), formatCredits(usage.credits), formatUsd(usage.costUsd)];
}
