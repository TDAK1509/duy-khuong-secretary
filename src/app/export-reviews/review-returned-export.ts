import { scopeDatabase } from '../db/scoped-database.ts';
import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import type { FileOutcome } from '../sheet-files/run-file-step.ts';
import type { FileClaim } from '../sheet-files/file-claims.ts';
import { buildCandidates } from './build-change-candidates.ts';
import { formatChangesFound, NO_CHANGE_TEXT, STRUCTURE_CHANGED_TEXT } from './export-review-texts.ts';
import { findSavedExport, type SavedExport } from './find-saved-export.ts';
import { listChangedCells } from './list-changed-cells.ts';
import { listPickupCompanies } from './list-pickup-companies.ts';
import { readReturnedRows, type ReturnedRows } from './read-returned-rows.ts';
import { readReturnedWorkbook, type ReturnedWorkbook } from './returned-export-marks.ts';
import { storeExportReview, type ReviewedChange } from './store-export-review.ts';
import { isPartialShare, suggestCause, type RowChange } from './suggest-cause.ts';

export async function reviewReturnedExport(database: Database, claim: FileClaim, bytes: Uint8Array): Promise<FileOutcome | null> {
  const returned = await readReturnedWorkbook(bytes);
  if (returned === null) return null;
  return runInTransaction(scopeDatabase(database, { workspaceId: claim.workspaceId }), (transaction) => reviewInTransaction(transaction, claim, returned));
}

async function reviewInTransaction(transaction: Transaction, claim: FileClaim, returned: ReturnedWorkbook): Promise<FileOutcome | null> {
  const saved = await findSavedExport(transaction, claim.workspaceId, returned.exportId);
  if (saved === null) return null;
  const rows = readReturnedRows(returned.workbook, saved);
  if (rows === null) return { text: STRUCTURE_CHANGED_TEXT, finishesFile: true };
  const changes = listChanges(saved, rows);
  if (changes.length === 0) return { text: NO_CHANGE_TEXT, finishesFile: true };
  await storeExportReview(transaction, claim, saved.id, await reviewChanges(transaction, claim.workspaceId, saved, changes));
  return { text: formatChangesFound(changes.length), finishesFile: true };
}

function listChanges(saved: SavedExport, rows: ReturnedRows): RowChange[] {
  return saved.rows.flatMap((row) => listChangedCells(saved.columns, row.cells, rows.get(row.id) ?? {}).map((change) => ({ rowId: row.id, change })));
}

async function reviewChanges(transaction: Transaction, workspaceId: string, saved: SavedExport, changes: RowChange[]): Promise<ReviewedChange[]> {
  const pickups = await listPickupCompanies(transaction, workspaceId, saved.rows);
  return changes.map((target) => reviewChange(saved, changes, target, pickups));
}

function reviewChange(saved: SavedExport, changes: RowChange[], target: RowChange, pickups: Map<string, string | null>): ReviewedChange {
  const cell = saved.rows.find((row) => row.id === target.rowId)!.cells[target.change.columnKey]!;
  const candidates = buildCandidates({ change: target.change, cell, pickupCompany: pickups.get(target.rowId) ?? null });
  return { exportRowId: target.rowId, change: target.change, candidates, suggestedCause: suggestCause(cell.source, candidates, isPartialShare(saved, changes, target)) };
}
