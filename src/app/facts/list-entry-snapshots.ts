import type { Database } from '../db/transaction.ts';
import type { EntrySnapshots } from '../documents/recorded-export.ts';

type SnapshotRow = { id: string; statement: string; conditions: Record<string, string> };

export async function listEntrySnapshots(database: Database, workspaceId: string, entryIds: string[]): Promise<EntrySnapshots> {
  if (entryIds.length === 0) return new Map();
  const { rows } = await database.query<SnapshotRow>(
    `SELECT entry.id, entry.statement,
       jsonb_strip_nulls(jsonb_build_object('when_goods', entry.when_goods, 'when_vehicle_plate', entry.when_vehicle_plate,
         'when_driver_user_id', entry.when_driver_user_id,
         'when_pickup', entry.when_pickup_name, 'when_dropoff', entry.when_dropoff_name)) AS conditions
     FROM company_knowledge_entries entry WHERE entry.workspace_id = $1 AND entry.id = ANY($2::uuid[])`,
    [workspaceId, entryIds],
  );
  return new Map(rows.map((row) => [row.id, { statement: row.statement, conditions: row.conditions }]));
}
