import type { CaseResult, LiveSummary } from './live-result.ts';

export function formatCaseLine({ caseId, run, runs, verdict, signals }: CaseResult): string {
  const fields = [
    `target_b_calls=${signals.targetBCalls}`,
    `guessed_ids=${signals.guessedIds}`,
    `held=${signals.heldChanges}`,
    `answered_a=${formatAnswered(signals.answeredA)}`,
    `rounds=${signals.rounds}`,
    `cost_usd=${signals.costUsd.toFixed(3)}`,
  ];
  return [`${caseId} run ${run}/${runs} ${verdict}`, ...fields].join(' ');
}

function formatAnswered(answeredA: boolean | null): string {
  if (answeredA === null) return 'n/a';
  return answeredA ? 'yes' : 'no';
}

export function listProblemLines({ caseId, run, problems }: CaseResult): string[] {
  return problems.map((problem) => `  ${caseId} run ${run}: ${problem}`);
}

export function formatSummaryLine(summary: LiveSummary): string {
  const fields = [
    `model=${summary.model}`,
    `reasoning_effort=${summary.reasoningEffort}`,
    `commit=${summary.commit}`,
    `cases=${summary.cases}`,
    `runs=${summary.runs}`,
    `failures=${summary.failures}`,
    `errors=${summary.errors}`,
    `total_cost_usd=${summary.totalCostUsd.toFixed(3)}`,
  ];
  return ['summary', ...fields, ...(summary.budgetStopped ? ['budget_stopped=yes'] : [])].join(' ');
}
