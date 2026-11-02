import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_IS_SET = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid`;
const OWNER_IS_SET = `nullif(current_setting('app.owner_user_id', true), '') IS NOT NULL`;
const USER_IS_OWNER = `user_id = nullif(current_setting('app.owner_user_id', true), '')::uuid`;

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['messages', 'records']);
  const ownedByScope = `${WORKSPACE_IS_SET} AND (NOT ${OWNER_IS_SET} OR ${USER_IS_OWNER})`;
  protectTable(pgm, 'messages', ownedByScope);
  protectTable(pgm, 'records', ownedByScope);
}

function protectTable(pgm: MigrationBuilder, table: string, condition: string): void {
  pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  pgm.sql(`CREATE POLICY in_scope ON ${table} USING (${condition}) WITH CHECK (${condition})`);
}
