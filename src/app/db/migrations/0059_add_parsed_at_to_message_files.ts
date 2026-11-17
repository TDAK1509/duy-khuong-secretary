import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_SCOPE = `nullif(current_setting('app.workspace_id', true), '')::uuid`;

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['message_files']);
  pgm.sql('ALTER TABLE message_files ADD COLUMN parsed_at timestamptz');
  pgm.sql('DROP POLICY in_scope ON message_files');
  pgm.sql(
    `CREATE POLICY in_scope ON message_files
       USING (coalesce(${WORKSPACE_SCOPE}, workspace_id) = workspace_id)
       WITH CHECK (workspace_id = ${WORKSPACE_SCOPE})`,
  );
}
