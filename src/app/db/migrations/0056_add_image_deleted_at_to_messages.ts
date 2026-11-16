import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql('ALTER TABLE messages ADD COLUMN image_deleted_at timestamptz');
  pgm.sql(
    'CREATE INDEX messages_cleanup_idx ON messages (created_at) WHERE image_key IS NOT NULL AND image_deleted_at IS NULL',
  );
}
