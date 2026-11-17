import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

const WORKSPACE_IS_SET = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid`;

export function up(pgm: MigrationBuilder): void {
  allowFileKindOnInboundEvents(pgm);
  createMessageFiles(pgm);
}

function allowFileKindOnInboundEvents(pgm: MigrationBuilder): void {
  lockTables(pgm, ['inbound_events']);
  pgm.sql('ALTER TABLE inbound_events DROP CONSTRAINT inbound_events_kind_check');
  pgm.sql(`ALTER TABLE inbound_events ADD CONSTRAINT inbound_events_kind_check CHECK (kind IN ('text', 'images', 'file'))`);
}

function createMessageFiles(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE message_files (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id uuid NOT NULL UNIQUE REFERENCES messages (id) ON DELETE CASCADE,
      workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
      file_key text NOT NULL,
      file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
      file_size_bytes integer NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 5242880),
      extension text NOT NULL CHECK (extension IN ('csv', 'xlsx')),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql('ALTER TABLE message_files ENABLE ROW LEVEL SECURITY');
  pgm.sql(`CREATE POLICY in_scope ON message_files USING (${WORKSPACE_IS_SET}) WITH CHECK (${WORKSPACE_IS_SET})`);
}
