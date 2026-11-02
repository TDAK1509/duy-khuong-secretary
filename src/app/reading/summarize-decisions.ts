import type { ReadingDecision } from './decide-reading.ts';

const OUTCOMES = ['cheap_pair', 'expensive_pair', 'unresolved'] as const;

export function summarizeDecisions(decisions: ReadingDecision[]): string[] {
  const escalated = decisions.filter((decision) => decision.strong !== null).length;
  return [
    `photos: ${decisions.length}`,
    ...OUTCOMES.map((outcome) => `${outcome}: ${countOutcome(decisions, outcome)}`),
    `escalation rate: ${formatPercent(escalated, decisions.length)}`,
  ];
}

function countOutcome(decisions: ReadingDecision[], outcome: ReadingDecision['outcome']): number {
  return decisions.filter((decision) => decision.outcome === outcome).length;
}

function formatPercent(part: number, whole: number): string {
  return whole === 0 ? '0%' : `${Math.round((part / whole) * 100)}%`;
}
