import { renewDueConnections, type RenewalDependencies } from '../channel-auth/renew-connections.ts';
import { cleanupOldPhotos, type CleanupDependencies } from '../intake/cleanup-old-photos.ts';
import { runDueTasks, type ScheduledRunDependencies } from '../schedules/runs/run-due-tasks.ts';

export type TickDependencies = {
  renewal: RenewalDependencies | null;
  scheduledRuns: ScheduledRunDependencies | null;
  photoCleanup: CleanupDependencies | null;
  shutdown: AbortSignal;
};

export async function runTick(dependencies: TickDependencies): Promise<void> {
  const { shutdown } = dependencies;
  if (dependencies.renewal && !shutdown.aborted) await renewDueConnections(dependencies.renewal);
  if (dependencies.scheduledRuns && !shutdown.aborted) await runDueTasks(dependencies.scheduledRuns);
  if (dependencies.photoCleanup && !shutdown.aborted) {
    const result = await cleanupOldPhotos(dependencies.photoCleanup);
    if (result.deleted + result.failed > 0) console.log(`[photo-cleanup] deleted ${result.deleted}, failed ${result.failed}`);
  }
}
