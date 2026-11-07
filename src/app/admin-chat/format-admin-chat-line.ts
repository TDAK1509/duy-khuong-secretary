import type { LoggedCall, LoggedRound, ToolLoopOutcome } from './run-tool-loop.ts';

const NO_CALLS = '-';

export function formatAdminChatLine(messageId: string, outcome: ToolLoopOutcome, rounds: LoggedRound[]): string {
  const roundsRun = rounds.filter((round) => round.ran).length;
  return `[admin-chat] message=${messageId} outcome=${outcome} rounds=${roundsRun} calls=${formatRounds(rounds)}`;
}

function formatRounds(rounds: LoggedRound[]): string {
  if (rounds.length === 0) return NO_CALLS;
  return rounds.map((round) => round.calls.map(formatCall).join(',')).join('/');
}

function formatCall(call: LoggedCall): string {
  return `${call.tool}(${call.arguments})=${call.result}`;
}
