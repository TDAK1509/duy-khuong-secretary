import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE outbound_messages (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
      channel text NOT NULL,
      account_id text NOT NULL,
      external_user_id text NOT NULL,
      kind text NOT NULL CHECK (kind IN ('text', 'image', 'template')),
      body text CHECK ((kind = 'text') = (body IS NOT NULL)),
      photo_key text CHECK ((kind = 'image') = (photo_key IS NOT NULL)),
      template_id text CHECK ((kind = 'template') = (template_id IS NOT NULL)),
      template_params jsonb,
      admin_membership_id uuid,
      status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'held', 'failed', 'unknown')),
      attempts smallint NOT NULL DEFAULT 0,
      available_at timestamptz NOT NULL DEFAULT now(),
      locked_until timestamptz,
      last_error text,
      sent_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(`CREATE INDEX outbound_messages_available_at_idx ON outbound_messages (available_at) WHERE status = 'queued'`);
  pgm.sql(
    'CREATE INDEX outbound_messages_recipient_seq_idx ON outbound_messages (channel, account_id, external_user_id, seq)',
  );
  pgm.sql('CREATE INDEX outbound_messages_sent_at_idx ON outbound_messages (sent_at) WHERE sent_at IS NOT NULL');
}
