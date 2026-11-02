import type { MigrationBuilder } from '../../../../src/app/db/migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.noTransaction();
  pgm.sql('CREATE INDEX CONCURRENTLY IF NOT EXISTS t_idx ON t (x)');
}
