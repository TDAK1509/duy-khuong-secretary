import type { MigrationBuilder } from '../../../../src/app/db/migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.noTransaction();
  pgm.sql('CREATE INDEX CONCURRENTLY "t idx-1" ON t (x)');
}
