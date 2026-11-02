import type { ReadingDecision } from './decide-reading.ts';
import type { ExpectedAnswers } from './load-expected-answers.ts';

const OUTCOMES = ['cheap_pair', 'expensive_pair', 'unresolved'] as const;

type AnswerField = 'amount_vnd' | 'occurred_on';

export type PhotoResult = { fileName: string; decision: ReadingDecision };

export function summarizeResults(results: PhotoResult[], expected: ExpectedAnswers | null): string[] {
  const decisions = results.map((result) => result.decision);
  const escalated = decisions.filter((decision) => decision.strong !== null).length;
  return [
    `photos: ${decisions.length}`,
    ...OUTCOMES.map((outcome) => `${outcome}: ${countOutcome(decisions, outcome)}`),
    `escalation rate: ${formatPercent(escalated, decisions.length)}`,
    ...(expected ? summarizeAccuracy(results, expected) : []),
  ];
}

function countOutcome(decisions: ReadingDecision[], outcome: ReadingDecision['outcome']): number {
  return decisions.filter((decision) => decision.outcome === outcome).length;
}

function summarizeAccuracy(results: PhotoResult[], expected: ExpectedAnswers): string[] {
  const judged = results.filter((result) => expected[result.fileName] !== undefined);
  return [
    `amounts correct: ${countCorrect(judged, expected, 'amount_vnd')}/${judged.length}`,
    `dates correct: ${countCorrect(judged, expected, 'occurred_on')}/${judged.length}`,
  ];
}

function countCorrect(judged: PhotoResult[], expected: ExpectedAnswers, field: AnswerField): number {
  return judged.filter((result) => readFirstAgreedValue(result.decision, field) === expected[result.fileName]?.[field])
    .length;
}

function readFirstAgreedValue(decision: ReadingDecision, field: AnswerField): number | string | null | undefined {
  return decision.agreed?.[0].items[0]?.[field];
}

function formatPercent(part: number, whole: number): string {
  return whole === 0 ? '0%' : `${Math.round((part / whole) * 100)}%`;
}
