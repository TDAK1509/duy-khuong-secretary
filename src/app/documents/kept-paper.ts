import type { NewRecord } from '../records/new-record.ts';
import type { SavedPaper } from './saved-papers.ts';

export type KeptPaper = { paper: SavedPaper; records: NewRecord[] };

export function findKeptPaper(keptPapers: KeptPaper[], record: NewRecord): SavedPaper | null {
  return keptPapers.find(({ records }) => records.includes(record))?.paper ?? null;
}
