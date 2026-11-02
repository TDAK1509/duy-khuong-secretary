import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS unaccent');
}
