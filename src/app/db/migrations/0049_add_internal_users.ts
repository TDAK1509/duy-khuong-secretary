import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['users']);
  pgm.sql('ALTER TABLE users ADD COLUMN is_internal boolean NOT NULL DEFAULT false');
  pgm.sql('REVOKE INSERT, UPDATE ON users FROM app_runtime');
  pgm.sql('GRANT INSERT (id, created_at) ON users TO app_runtime');
}
