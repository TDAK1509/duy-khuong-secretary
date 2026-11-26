import type { CaseSignals, Verdict } from './score-case.ts';

export type CaseResult = {
  caseId: string;
  run: number;
  runs: number;
  verdict: Verdict;
  problems: string[];
  signals: CaseSignals;
  replies: string[];
};

export type LiveSummary = {
  model: string;
  reasoningEffort: string;
  commit: string;
  cases: number;
  runs: number;
  failures: number;
  errors: number;
  totalCostUsd: number;
  budgetStopped: boolean;
};
