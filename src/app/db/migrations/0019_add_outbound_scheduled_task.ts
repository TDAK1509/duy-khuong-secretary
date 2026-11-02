import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['outbound_messages', 'scheduled_tasks']);
  pgm.sql('ALTER TABLE outbound_messages ADD COLUMN scheduled_task_id uuid');
  pgm.sql(`
    ALTER TABLE outbound_messages
      ADD CONSTRAINT outbound_messages_scheduled_task_id_fkey
      FOREIGN KEY (scheduled_task_id) REFERENCES scheduled_tasks (id) ON DELETE SET NULL NOT VALID
  `);
}
