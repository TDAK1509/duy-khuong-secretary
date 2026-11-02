import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import { addDateConditions } from './add-date-conditions.ts';
import { WhereClause } from './where-clause.ts';

export type CategoryCount = { category: string; count: number; amount_vnd: number };

export type MemberCount = { member: string; total_count: number; by_category: CategoryCount[] };

type CountRow = { user_id: string; sender_name: string; category: string; count: number; amount_vnd: number };

const COUNT_BY_CATEGORY = `SELECT record.user_id, (array_agg(record.sender_name ORDER BY record.created_at DESC))[1] AS sender_name,
    record.category, count(*)::int AS count, coalesce(sum(record.amount_vnd), 0)::float8 AS amount_vnd
  FROM records record`;

const GROUP_BY_SENDER = `GROUP BY record.user_id, record.category ORDER BY record.user_id, record.category`;

export async function countRecords(
  database: Database,
  scope: AccessScope,
  range: { addedFrom: string; addedTo: string },
): Promise<MemberCount[]> {
  const counted = await countByCategory(database, scope, range);
  const { rows: members } = await database.query<{ user_id: string; display_name: string }>(
    'SELECT user_id, display_name FROM memberships WHERE workspace_id = $1 ORDER BY display_name, id',
    [scope.workspaceId],
  );
  const current = members.map((member) => toMemberCount(member.display_name, counted.filter((row) => row.user_id === member.user_id)));
  const currentUserIds = new Set(members.map((member) => member.user_id));
  return [...current, ...listFormerMembers(counted.filter((row) => !currentUserIds.has(row.user_id)))];
}

async function countByCategory(database: Database, scope: AccessScope, range: { addedFrom: string; addedTo: string }): Promise<CountRow[]> {
  const where = new WhereClause();
  where.require(`record.workspace_id = ${where.bind(scope.workspaceId)}`);
  addDateConditions(where, range);
  const { rows } = await database.query<CountRow>(`${COUNT_BY_CATEGORY} WHERE ${where.toSql()} ${GROUP_BY_SENDER}`, where.values);
  return rows;
}

function listFormerMembers(rows: CountRow[]): MemberCount[] {
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  return userIds.map((userId) => {
    const own = rows.filter((row) => row.user_id === userId);
    return toMemberCount(own[0]?.sender_name ?? '', own);
  });
}

function toMemberCount(member: string, rows: CountRow[]): MemberCount {
  const byCategory = [...rows]
    .sort((first, second) => first.category.localeCompare(second.category))
    .map(({ category, count, amount_vnd: amountVnd }) => ({ category, count, amount_vnd: amountVnd }));
  return { member, total_count: byCategory.reduce((total, row) => total + row.count, 0), by_category: byCategory };
}
