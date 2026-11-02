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

export async function findDueRecords(database: Database, task: ClaimedTask, now: Date): Promise<DueRecord[]> {
  const scoped = scopeDatabase(database, { workspaceId: task.workspaceId });
  const { rows } = await scoped.query<DueRecord>(
    `SELECT record.id AS record_id, record.vehicle_plate AS plate, record.maintenance_item, record.sender_name AS sent_by,
       to_char(${VIETNAM_DATE('message.created_at')}, 'DD/MM/YYYY') AS sent_on,
       to_char(record.occurred_on, 'DD/MM/YYYY') AS occurred_on,
       (${VIETNAM_DATE('$3::timestamptz')} - ${VIETNAM_DATE('message.created_at')})::int AS days_since_sent
     FROM records record
     JOIN messages message ON message.id = record.message_id
     JOIN unnest($1::text[], $2::int[]) AS rule(item, age_days) ON rule.item = ${ACCENT_FREE_ITEM}
     WHERE record.workspace_id = $4 AND record.category = 'maintenance'
       AND ${VIETNAM_DATE('$3::timestamptz')} - ${VIETNAM_DATE('message.created_at')} >= rule.age_days
     ORDER BY record.vehicle_plate, record.maintenance_item`,
    [...unzipRules(task), now, task.workspaceId],
  );
  return rows;
}

function unzipRules(task: ClaimedTask): [string[], number[]] {
  const rules = task.maintenanceRules.filter((rule) => toAccentFreeForm(rule.maintenanceItem) !== null);
  return [rules.map((rule) => toAccentFreeForm(rule.maintenanceItem) ?? ''), rules.map((rule) => rule.ageDays)];
}
