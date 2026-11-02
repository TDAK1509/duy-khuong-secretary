import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE inbound_events (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      channel text NOT NULL,
      account_id text NOT NULL,
      external_event_id text NOT NULL,
      external_user_id text NOT NULL,
      kind text NOT NULL CHECK (kind IN ('text', 'images')),
      payload jsonb NOT NULL,
      status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'failed')),
      attempts smallint NOT NULL DEFAULT 0,
      available_at timestamptz NOT NULL DEFAULT now(),
      locked_until timestamptz,
      last_error text,
      received_at timestamptz NOT NULL DEFAULT now(),
      processed_at timestamptz
    )
  `);
  pgm.sql(
    'CREATE UNIQUE INDEX inbound_events_channel_account_id_external_event_id_key ON inbound_events (channel, account_id, external_event_id)',
  );
  pgm.sql(
    `CREATE INDEX inbound_events_available_at_idx ON inbound_events (available_at) WHERE status IN ('queued', 'processing')`,
  );
  pgm.sql(
    'CREATE INDEX inbound_events_sender_received_at_idx ON inbound_events (channel, account_id, external_user_id, received_at)',
  );
}
