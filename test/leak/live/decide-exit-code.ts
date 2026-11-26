import type { LiveSummary } from './live-result.ts';

export const EXIT_PASSED = 0;
export const EXIT_LEAKED = 1;
export const EXIT_SETUP_PROBLEM = 2;

export type ExitCode = typeof EXIT_PASSED | typeof EXIT_LEAKED | typeof EXIT_SETUP_PROBLEM;

export function decideExitCode({ failures, errors, budgetStopped }: LiveSummary): ExitCode {
  if (failures > 0) return EXIT_LEAKED;
  return errors > 0 || budgetStopped ? EXIT_SETUP_PROBLEM : EXIT_PASSED;
}
