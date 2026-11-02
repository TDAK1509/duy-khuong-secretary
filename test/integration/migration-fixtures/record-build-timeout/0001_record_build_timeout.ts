import type { MigrationBuilder } from '../../../../src/app/db/migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.noTransaction();
  pgm.sql("CREATE TABLE seen AS SELECT current_setting('statement_timeout') AS statement_timeout");
}
