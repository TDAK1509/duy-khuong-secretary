import type { MigrationBuilder } from '../../../../src/app/db/migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql('INSERT INTO fixture_rows (id) VALUES (1)');
}
