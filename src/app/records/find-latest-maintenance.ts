import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';

export type LatestMaintenance = { plate: string; maintenance_item: string; sent_by: string; sent_on: string };

const SELECT_LATEST_PER_TRUCK_PART = `SELECT DISTINCT ON (record.vehicle_plate, record.maintenance_item)
    record.vehicle_plate AS plate, record.maintenance_item, record.sender_name AS sent_by,
    to_char(record.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS sent_on
  FROM records record
  WHERE record.workspace_id = $1 AND record.category = 'maintenance'
  ORDER BY record.vehicle_plate, record.maintenance_item, record.created_at DESC, record.id DESC`;

export async function findLatestMaintenance(database: Database, scope: AccessScope): Promise<LatestMaintenance[]> {
  const { rows } = await database.query<LatestMaintenance>(SELECT_LATEST_PER_TRUCK_PART, [scope.workspaceId]);
  return rows;
}
