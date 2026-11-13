import type { Database } from '../db/transaction.ts';
import { readRecentAdditions, type RecentAddition } from './read-recent-additions.ts';
import { readUsageByKind, type KindUsage } from './read-usage-by-kind.ts';
import { readWorkspaceOverview, type WorkspaceOverview } from './read-workspace-overview.ts';

export type Dashboard = { workspaces: WorkspaceOverview[]; usageByKind: KindUsage[]; recentAdditions: RecentAddition[] };

export async function readDashboard(database: Database, now: Date): Promise<Dashboard> {
  const [workspaces, usageByKind, recentAdditions] = await Promise.all([
    readWorkspaceOverview(database, now),
    readUsageByKind(database, now),
    readRecentAdditions(database),
  ]);
  return { workspaces, usageByKind, recentAdditions };
}
