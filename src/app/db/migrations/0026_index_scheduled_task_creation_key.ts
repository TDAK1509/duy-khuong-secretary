import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.noTransaction();
  pgm.sql(`
    CREATE UNIQUE INDEX CONCURRENTLY scheduled_tasks_creation_key_key
    ON scheduled_tasks (creation_key)
    WHERE creation_key IS NOT NULL
  `);
}
