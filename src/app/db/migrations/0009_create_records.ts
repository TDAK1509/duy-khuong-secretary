import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE records (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      user_id uuid NOT NULL,
      message_id uuid NOT NULL,
      item_index smallint NOT NULL CHECK (item_index >= 0),
      sender_name text NOT NULL CHECK (char_length(sender_name) BETWEEN 1 AND 60),
      category text NOT NULL
        CHECK (category IN ('fuel', 'toll', 'delivery_pickup', 'delivery_dropoff', 'maintenance', 'certificate', 'other')),
      maintenance_item text CHECK ((category = 'maintenance') = (maintenance_item IS NOT NULL)),
      vehicle_plate text CHECK (category <> 'maintenance' OR vehicle_plate IS NOT NULL),
      document_number text,
      occurred_on date,
      amount_vnd bigint CHECK (amount_vnd >= 0),
      identifiers text[] NOT NULL DEFAULT '{}',
      summary text NOT NULL CHECK (char_length(summary) > 0),
      details jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(details) = 'array'),
      read_by text NOT NULL CHECK (read_by IN ('cheap_pair', 'expensive_pair')),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (message_id, workspace_id, user_id) REFERENCES messages (id, workspace_id, user_id) ON DELETE CASCADE
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX records_message_id_item_index_key ON records (message_id, item_index)');
  pgm.sql('CREATE INDEX records_workspace_id_created_at_id_idx ON records (workspace_id, created_at, id)');
  pgm.sql('CREATE INDEX records_workspace_id_user_id_created_at_idx ON records (workspace_id, user_id, created_at)');
  pgm.sql(`
    CREATE INDEX records_maintenance_idx ON records (workspace_id, vehicle_plate, maintenance_item, created_at)
    WHERE category = 'maintenance'
  `);
}
