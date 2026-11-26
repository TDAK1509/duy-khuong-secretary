import type { ChatService } from '../../../src/services/chat/chat-service.ts';
import type { LeakDatabases } from '../support/leak-databases.ts';
import { decideExitCode, type ExitCode } from './decide-exit-code.ts';
import { formatCaseLine, formatSummaryLine, listProblemLines } from './format-live-output.ts';
import type { LiveAttackCase } from './live-attack-case.ts';
import type { CaseResult, LiveSummary } from './live-result.ts';
import { playCase } from './play-case.ts';
import { RecordingChat } from './recording-chat.ts';
import { scoreCase } from './score-case.ts';
import { writeLiveReport } from './write-live-report.ts';

export type LiveModel = { name: string; reasoningEffort: string; createChat(): ChatService };

export type LiveRun = {
  cases: LiveAttackCase[];
  runs: number;
  maxUsd: number;
  model: LiveModel;
  databases: LeakDatabases;
  reportDirectory: string;
  commitSha: string;
  log: (line: string) => void;
};

type Collected = { results: CaseResult[]; budgetStopped: boolean };

export async function runLiveLeak(run: LiveRun): Promise<ExitCode> {
  const { results, budgetStopped } = await collectResults(run);
  const summary = summarizeRun(run, results, budgetStopped);
  run.log(formatSummaryLine(summary));
  await writeLiveReport(run.reportDirectory, summary, results);
  return decideExitCode(summary);
}

async function collectResults(run: LiveRun): Promise<Collected> {
  const results: CaseResult[] = [];
  for (const attackCase of run.cases) {
    for (let number = 1; number <= run.runs; number += 1) {
      if (sumCost(results) > run.maxUsd) return { results, budgetStopped: true };
      results.push(await runCase(run, attackCase, number));
      logResult(run, results.at(-1));
    }
  }
  return { results, budgetStopped: false };
}

function logResult(run: LiveRun, result: CaseResult | undefined): void {
  if (result === undefined) return;
  run.log(formatCaseLine(result));
  for (const line of listProblemLines(result)) run.log(line);
}

function sumCost(results: CaseResult[]): number {
  return results.reduce((total, { signals }) => total + signals.costUsd, 0);
}

async function runCase(run: LiveRun, attackCase: LiveAttackCase, number: number): Promise<CaseResult> {
  const chat = new RecordingChat(run.model.createChat());
  const position = { caseId: attackCase.id, run: number, runs: run.runs };
  try {
    const { owner, runtime: database } = run.databases;
    const recorded = await playCase({ owner, database, chat, attackCase });
    return { ...position, ...scoreCase(recorded), replies: recorded.replies };
  } catch (error) {
    return describeCrashedCase(position, chat, error);
  }
}

type CasePosition = Pick<CaseResult, 'caseId' | 'run' | 'runs'>;

function describeCrashedCase(position: CasePosition, chat: RecordingChat, error: unknown): CaseResult {
  const signals = { targetBCalls: 0, guessedIds: 0, heldChanges: 0, answeredA: null, rounds: chat.requests.length, costUsd: chat.costUsd };
  const problem = error instanceof Error ? error.message : String(error);
  return { ...position, verdict: 'ERROR', problems: [`the case stopped before it finished: ${problem}`], signals, replies: [] };
}

function summarizeRun({ cases, runs, model, commitSha }: LiveRun, results: CaseResult[], budgetStopped: boolean): LiveSummary {
  return {
    model: model.name,
    reasoningEffort: model.reasoningEffort,
    commit: commitSha,
    cases: cases.length,
    runs,
    failures: results.filter(({ verdict }) => verdict === 'FAIL').length,
    errors: results.filter(({ verdict }) => verdict === 'ERROR').length,
    totalCostUsd: sumCost(results),
    budgetStopped,
  };
}
