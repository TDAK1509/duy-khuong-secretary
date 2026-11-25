import { resolveFinalValues } from '../../documents/corrections/list-paper-changes.ts';
import type { CorrectedPaper, FoundPaper, NewPaperValues } from '../../documents/corrections/paper-correction.ts';

type Outcome = 'changed' | 'already_right' | 'merged';

export function describeFoundPaper({ title, kind, document_number: number, document_date: date, plate, sender, sent_at: sentAt }: FoundPaper): Record<string, string | null> {
  return { title, kind, number, date, plate, sender, sent_at: sentAt };
}

export function describeCorrectedPaper({ paper, changes, mergedIntoId }: CorrectedPaper, values: NewPaperValues): Record<string, unknown> {
  const final = resolveFinalValues(paper, values);
  return {
    title: paper.title,
    kind: paper.kind,
    number: final.documentNumber,
    date: final.documentDate,
    outcome: pickOutcome(changes.length, mergedIntoId),
    changes: changes.map(({ field, before, after }) => ({ field, before, after })),
  };
}

function pickOutcome(changeCount: number, mergedIntoId: string | null): Outcome {
  if (changeCount === 0) return 'already_right';
  return mergedIntoId === null ? 'changed' : 'merged';
}
