import { lockTables } from '../../../../src/app/db/lock-tables.ts';
import type { MigrationBuilder } from '../../../../src/app/db/migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['t']);
  pgm.sql('ALTER TABLE t ADD COLUMN extra integer');
}
