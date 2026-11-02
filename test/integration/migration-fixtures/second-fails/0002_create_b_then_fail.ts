import type { MigrationBuilder } from '../../../../src/app/db/migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql('CREATE TABLE b (id integer)');
  pgm.sql('THIS IS NOT SQL');
}
