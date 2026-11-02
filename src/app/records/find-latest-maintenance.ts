import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';

export type LatestMaintenance = { plate: string; maintenance_item: string };

export async function findLatestMaintenance(database: Database, scope: AccessScope): Promise<LatestMaintenance[]> {
  const { rows } = await database.query<LatestMaintenance>(
    `SELECT record.vehicle_plate AS plate, record.maintenance_item
     FROM records record
     WHERE record.workspace_id = $1 AND record.category = 'maintenance'`,
    [scope.workspaceId],
  );
  return rows;
}
