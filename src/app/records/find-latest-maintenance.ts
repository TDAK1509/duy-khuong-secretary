import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import { normalizeCode, toAccentFreeForm } from '../reading/normalize.ts';
import { encodeMaintenanceCursor, type MaintenanceCursor } from './maintenance-cursor.ts';
import { WhereClause } from './where-clause.ts';

export type MaintenanceFilters = {
  plate: string | null;
  maintenanceItem: string | null;
  cursor: MaintenanceCursor | null;
};

export type LatestMaintenance = {
  record_id: string;
  plate: string;
  maintenance_item: string;
  sent_by: string;
  sent_on: string;
  occurred_on: string | null;
  days_since_sent: number;
  summary: string;
};

export type MaintenancePage = { items: LatestMaintenance[]; nextCursor: string | null };

const PAGE_SIZE = 50;

const VIETNAM_SENT_DATE = `(message.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;

const NEWEST_FIRST_PER_TRUCK_PART = `ORDER BY record.vehicle_plate, record.maintenance_item, message.created_at DESC, record.id DESC`;

export async function findLatestMaintenance(
  database: Database,
  scope: AccessScope,
  filters: MaintenanceFilters,
  now: Date,
): Promise<MaintenancePage> {
  const where = buildWhere(scope, filters);
  const select = selectLatestPerTruckPart(where.bind(now.toISOString()));
  const { rows } = await database.query<LatestMaintenance>(
    `${select} WHERE ${where.toSql()} ${NEWEST_FIRST_PER_TRUCK_PART} LIMIT ${PAGE_SIZE + 1}`,
    where.values,
  );
  return toPage(rows);
}

function buildWhere(scope: AccessScope, filters: MaintenanceFilters): WhereClause {
  const where = new WhereClause();
  where.require(`record.workspace_id = ${where.bind(scope.workspaceId)}`);
  where.require(`record.category = 'maintenance'`);
  if (filters.plate !== null) where.require(`record.vehicle_plate = ${where.bind(normalizeCode(filters.plate))}`);
  if (filters.maintenanceItem !== null) where.require(buildItemCondition(where, filters.maintenanceItem));
  if (filters.cursor !== null) {
    where.require(`(record.vehicle_plate, record.maintenance_item) > (${where.bind(filters.cursor.plate)}, ${where.bind(filters.cursor.maintenanceItem)})`);
  }
  return where;
}

function buildItemCondition(where: WhereClause, maintenanceItem: string): string {
  const bound = where.bind(toAccentFreeForm(maintenanceItem) ?? '');
  return `regexp_replace(trim(lower(unaccent(record.maintenance_item))), '\\s+', ' ', 'g') = ${bound}`;
}

function selectLatestPerTruckPart(nowParameter: string): string {
  return `SELECT DISTINCT ON (record.vehicle_plate, record.maintenance_item)
    record.id AS record_id, record.vehicle_plate AS plate, record.maintenance_item, record.sender_name AS sent_by,
    to_char(${VIETNAM_SENT_DATE}, 'YYYY-MM-DD') AS sent_on,
    to_char(record.occurred_on, 'YYYY-MM-DD') AS occurred_on, record.summary,
    ((${nowParameter}::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - ${VIETNAM_SENT_DATE})::int AS days_since_sent
  FROM records record JOIN messages message ON message.id = record.message_id`;
}

function toPage(rows: LatestMaintenance[]): MaintenancePage {
  const items = rows.slice(0, PAGE_SIZE);
  const last = items[items.length - 1];
  const hasMore = rows.length > PAGE_SIZE && last !== undefined;
  return { items, nextCursor: hasMore ? encodeMaintenanceCursor({ plate: last.plate, maintenanceItem: last.maintenance_item }) : null };
}
