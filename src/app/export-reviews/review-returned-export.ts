import { scopeDatabase } from '../db/scoped-database.ts';
import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import type { FileOutcome } from '../sheet-files/run-file-step.ts';
import type { FileClaim } from '../sheet-files/file-claims.ts';
import { formatChangesFound, NO_CHANGE_TEXT, STRUCTURE_CHANGED_TEXT } from './export-review-texts.ts';
import { findSavedExport, type SavedExport } from './find-saved-export.ts';
import { listChangedCells } from './list-changed-cells.ts';
import { readReturnedRows, type ReturnedRows } from './read-returned-rows.ts';
import { readReturnedWorkbook, type ReturnedWorkbook } from './returned-export-marks.ts';
import { storeExportReview, type ReviewedChange } from './store-export-review.ts';

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
  await storeExportReview(transaction, claim, saved.id, changes);
  return { text: formatChangesFound(changes.length), finishesFile: true };
}

function listChanges(saved: SavedExport, rows: ReturnedRows): ReviewedChange[] {
  return saved.rows.flatMap((row) => listChangedCells(saved.columns, row.cells, rows.get(row.id) ?? {}).map((change) => ({ exportRowId: row.id, change })));
}
