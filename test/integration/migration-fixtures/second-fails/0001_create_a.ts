import type { MigrationBuilder } from '../../../../src/app/db/migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql('CREATE TABLE a (id integer)');
}
