import { renewDueConnections, type RenewalDependencies } from '../channel-auth/renew-connections.ts';
import { runDueTasks, type ScheduledRunDependencies } from '../scheduled-runs/run-due-tasks.ts';

export type TickDependencies = {
  renewal: RenewalDependencies | null;
  scheduledRuns: ScheduledRunDependencies | null;
};

export async function runTick(dependencies: TickDependencies): Promise<void> {
  if (dependencies.renewal) await renewDueConnections(dependencies.renewal);
  if (dependencies.scheduledRuns) await runDueTasks(dependencies.scheduledRuns);
}
