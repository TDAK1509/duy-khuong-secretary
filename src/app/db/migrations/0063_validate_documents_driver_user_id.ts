import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql('ALTER TABLE documents VALIDATE CONSTRAINT documents_workspace_id_driver_user_id_fkey');
}
