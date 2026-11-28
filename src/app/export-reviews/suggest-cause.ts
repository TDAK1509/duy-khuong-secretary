import type { CellSource } from '../documents/recorded-export.ts';
import type { CandidateAction } from './build-change-candidates.ts';
import type { SavedExport } from './find-saved-export.ts';
import type { CellChange } from './list-changed-cells.ts';

export type SuggestedCause = CandidateAction['cause'] | 'unclear';

export type RowChange = { rowId: string; change: CellChange };

export function suggestCause(source: CellSource | null, actions: CandidateAction[], isPartialShare: boolean): SuggestedCause {
  const causes = [...new Set(actions.map((action) => action.cause))];
  if (causes.length === 0 || (causes.length > 1 && isPartialShare)) return 'unclear';
  const natural = source?.kind === 'paper' ? 'paper_reading' : 'company_knowledge';
  return causes.includes(natural) ? natural : causes[0]!;
}

export function isPartialShare(saved: SavedExport, changes: RowChange[], target: RowChange): boolean {
  const entryId = readEntryId(saved, target);
  if (entryId === undefined) return false;
  const sharing = saved.rows.filter((row) => row.cells[target.change.columnKey]?.source?.entry_id === entryId);
  const sameChanges = changes.filter((candidate) => candidate.change.columnKey === target.change.columnKey && candidate.change.after === target.change.after && sharing.some((row) => row.id === candidate.rowId));
  return sameChanges.length < sharing.length;
}

function readEntryId(saved: SavedExport, { rowId, change }: RowChange): string | undefined {
  return saved.rows.find((row) => row.id === rowId)?.cells[change.columnKey]?.source?.entry_id;
}
