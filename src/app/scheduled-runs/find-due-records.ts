import { scopeDatabase } from '../db/scoped-database.ts';
import type { Database } from '../db/transaction.ts';
import { toAccentFreeForm } from '../reading/normalize.ts';
import type { ClaimedTask } from './claim-due-task.ts';

export type DueRecord = {
  record_id: string;
  plate: string;
  maintenance_item: string;
  sent_by: string;
  sent_on: string;
  occurred_on: string | null;
  days_since_sent: number;
};

const VIETNAM_DATE = (instant: string) => `(${instant} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;

const ACCENT_FREE_ITEM = `regexp_replace(trim(lower(unaccent(record.maintenance_item))), '\\s+', ' ', 'g')`;

const DUE_RECORDS_SQL = `WITH newest AS (
       SELECT DISTINCT ON (record.vehicle_plate, record.maintenance_item)
         record.id, record.vehicle_plate, record.maintenance_item, record.sender_name, record.occurred_on,
         message.created_at AS sent_at
       FROM records record JOIN messages message ON message.id = record.message_id
       WHERE record.workspace_id = $4 AND record.category = 'maintenance'
       ORDER BY record.vehicle_plate, record.maintenance_item, message.created_at DESC, record.id DESC
     )
     SELECT record.id AS record_id, record.vehicle_plate AS plate, record.maintenance_item, record.sender_name AS sent_by,
       to_char(${VIETNAM_DATE('record.sent_at')}, 'DD/MM/YYYY') AS sent_on,
       to_char(record.occurred_on, 'DD/MM/YYYY') AS occurred_on,
       (${VIETNAM_DATE('$3::timestamptz')} - ${VIETNAM_DATE('record.sent_at')})::int AS days_since_sent
     FROM newest record
     JOIN unnest($1::text[], $2::int[]) AS rule(item, age_days) ON rule.item = ${ACCENT_FREE_ITEM}
     WHERE ${VIETNAM_DATE('$3::timestamptz')} - ${VIETNAM_DATE('record.sent_at')} >= rule.age_days
       AND NOT EXISTS (SELECT 1 FROM maintenance_notifications reminded WHERE reminded.task_id = $5 AND reminded.record_id = record.id)
     ORDER BY record.vehicle_plate, record.maintenance_item`;

export async function findDueRecords(database: Database, task: ClaimedTask, now: Date): Promise<DueRecord[]> {
  const scoped = scopeDatabase(database, { workspaceId: task.workspaceId });
  const { rows } = await scoped.query<DueRecord>(
    DUE_RECORDS_SQL,
    [...unzipRules(task), now, task.workspaceId, task.id],
  );
  return rows;
}

function unzipRules(task: ClaimedTask): [string[], number[]] {
  const rules = task.maintenanceRules.filter((rule) => toAccentFreeForm(rule.maintenanceItem) !== null);
  return [rules.map((rule) => toAccentFreeForm(rule.maintenanceItem) ?? ''), rules.map((rule) => rule.ageDays)];
}
