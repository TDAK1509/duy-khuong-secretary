import type { PostgresPool } from '../../../src/providers/database/postgres.ts';

export type WorkspaceTable = { name: string; hasRowLevelSecurity: boolean };

export async function listWorkspaceTables(database: PostgresPool): Promise<WorkspaceTable[]> {
  const { rows } = await database.query<{ name: string; has_row_level_security: boolean }>(
    `SELECT class.relname AS name, class.relrowsecurity AS has_row_level_security
     FROM pg_class class
     JOIN pg_attribute attribute ON attribute.attrelid = class.oid AND attribute.attname = 'workspace_id' AND NOT attribute.attisdropped
     WHERE class.relnamespace = 'public'::regnamespace AND class.relkind IN ('r', 'p')
     ORDER BY class.relname`,
  );
  return rows.map((row) => ({ name: row.name, hasRowLevelSecurity: row.has_row_level_security }));
}
