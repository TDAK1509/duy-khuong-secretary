import { escapeHtml } from './escape-html.ts';
import { formatCredits, formatUsage, formatUsd } from './format-credits.ts';
import type { Dashboard } from './read-dashboard.ts';
import type { RecentAddition } from './read-recent-additions.ts';
import type { KindUsage } from './read-usage-by-kind.ts';
import type { WorkspaceOverview } from './read-workspace-overview.ts';
import { renderAddCreditsForm, type AddCreditsFormView } from './render-add-credits-form.ts';
import { renderDocument, renderTable } from './render-document.ts';
import {
  ADDER_COLUMN,
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
  NOTE_COLUMN,
  RECENT_ADDITIONS_HEADING,
  STARTING_GRANT_ADDER,
  TIME_COLUMN,
  TODAY_COLUMN,
  USAGE_BY_KIND_HEADING,
  WORKSPACE_COLUMN,
} from './internal-admin-texts.ts';

export function renderDashboardPage({ workspaces, usageByKind, recentAdditions }: Dashboard, form: AddCreditsFormView): string {
  return renderDocument(
    [
      `<h1>${ADMIN_TITLE}</h1>`,
      `<section><h2>${BALANCE_AND_USAGE_HEADING}</h2>`,
      renderTable('overview', [WORKSPACE_COLUMN, BALANCE_COLUMN, TODAY_COLUMN, LAST_WEEK_COLUMN, LAST_MONTH_COLUMN], workspaces.map(listOverviewCells)),
      '</section>',
      '<div class="columns">',
      `<section>${renderAddCreditsForm(form, workspaces)}</section>`,
      `<section><h2>${RECENT_ADDITIONS_HEADING}</h2>`,
      renderTable('additions', [TIME_COLUMN, WORKSPACE_COLUMN, CREDITS_COLUMN, ADDER_COLUMN, NOTE_COLUMN], recentAdditions.map(listAdditionCells)),
      '</section>',
      '</div>',
      `<section><h2>${USAGE_BY_KIND_HEADING}</h2>`,
      renderTable('kinds', [WORKSPACE_COLUMN, KIND_COLUMN, CALLS_COLUMN, CREDITS_COLUMN, COST_COLUMN], usageByKind.map(listKindCells)),
      '</section>',
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

function listAdditionCells(addition: RecentAddition): string[] {
  const adder = addition.adder === null ? STARTING_GRANT_ADDER : escapeHtml(addition.adder);
  return [addition.time, escapeHtml(addition.workspaceName), formatCredits(addition.credits), adder, escapeHtml(addition.note)];
}
