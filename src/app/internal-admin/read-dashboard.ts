import type { Database } from '../db/transaction.ts';
import { readUsageByKind, type KindUsage } from './read-usage-by-kind.ts';
import { readWorkspaceOverview, type WorkspaceOverview } from './read-workspace-overview.ts';

export type Dashboard = { workspaces: WorkspaceOverview[]; usageByKind: KindUsage[] };

export async function readDashboard(database: Database, now: Date): Promise<Dashboard> {
  const [workspaces, usageByKind] = await Promise.all([readWorkspaceOverview(database, now), readUsageByKind(database, now)]);
  return { workspaces, usageByKind };
}
