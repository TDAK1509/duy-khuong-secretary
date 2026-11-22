import { hasCompatiblePlate, type DocumentDraft } from '../documents/document-draft.ts';

export type SavedPaper = { issuerKey: string | null; documentNumber: string | null; documentDate: string | null; vehiclePlate: string | null };

export function pickMatchingDraft(drafts: DocumentDraft[], paper: SavedPaper, templateId: string): DocumentDraft | null {
  if (paper.issuerKey === null || paper.documentNumber === null) return null;
  const matching = drafts.filter((draft) => isSamePaper(draft, paper) && draft.items.every(({ item }) => item.template === templateId));
  return matching.length === 1 ? (matching[0] ?? null) : null;
}

function isSamePaper(draft: DocumentDraft, paper: SavedPaper): boolean {
  return (
    draft.issuerKey === paper.issuerKey &&
    draft.documentNumber === paper.documentNumber &&
    draft.documentDate === paper.documentDate &&
    hasCompatiblePlate(draft.vehiclePlate, paper.vehiclePlate)
  );
}
