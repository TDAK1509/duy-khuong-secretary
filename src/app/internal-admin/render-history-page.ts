import { escapeHtml } from '../chatgpt/escape-html.ts';
import { formatCredits, formatUsd } from './format-credits.ts';
import type { AdditionEntry, HistoryEntry, UsageEntry } from './read-credit-history.ts';
import { renderDocument, renderTable } from './render-document.ts';
import {
  ADDER_COLUMN,
  BACK_LINK_TEXT,
  BALANCE_AFTER_COLUMN,
  CALLS_COLUMN,
  COST_COLUMN,
  CREDITS_COLUMN,
  HISTORY_HEADING_PREFIX,
  KIND_COLUMN,
  KIND_LABELS,
  NOTE_COLUMN,
  SOURCE_LABELS,
  STARTING_GRANT_ADDER,
  TIME_COLUMN,
} from './internal-admin-texts.ts';

const COLUMNS = [TIME_COLUMN, KIND_COLUMN, CALLS_COLUMN, CREDITS_COLUMN, COST_COLUMN, ADDER_COLUMN, NOTE_COLUMN, BALANCE_AFTER_COLUMN];

export function renderHistoryPage(workspaceName: string, entries: HistoryEntry[]): string {
  return renderDocument(
    [
      `<p class="back"><a href="/admin">← ${BACK_LINK_TEXT}</a></p>`,
      `<h1>${HISTORY_HEADING_PREFIX}${escapeHtml(workspaceName)}</h1>`,
      `<section>${renderTable('history', COLUMNS, entries.map(listEntryCells))}</section>`,
    ].join('\n'),
  );
}

function listEntryCells(entry: HistoryEntry): string[] {
  return entry.type === 'addition' ? listAdditionCells(entry) : listUsageCells(entry);
}

function listAdditionCells(entry: AdditionEntry): string[] {
  const adder = entry.adder === null ? STARTING_GRANT_ADDER : escapeHtml(entry.adder);
  return [entry.time, SOURCE_LABELS[entry.source], '', `+${formatCredits(entry.credits)}`, '', adder, escapeHtml(entry.note), formatCredits(entry.balanceAfter)];
}

function listUsageCells(entry: UsageEntry): string[] {
  const credits = Number(entry.credits) === 0 ? '0' : `−${formatCredits(entry.credits)}`;
  const balanceAfter = entry.balanceAfter === null ? '' : formatCredits(entry.balanceAfter);
  return [entry.day, KIND_LABELS[entry.kind], String(entry.calls), credits, formatUsd(entry.costUsd), '', '', balanceAfter];
}
