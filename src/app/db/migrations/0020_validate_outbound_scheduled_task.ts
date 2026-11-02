import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql('ALTER TABLE outbound_messages VALIDATE CONSTRAINT outbound_messages_scheduled_task_id_fkey');
}
