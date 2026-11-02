import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE channel_connections (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      channel text NOT NULL CHECK (channel IN ('zalo-oa')),
      account_id text NOT NULL,
      access_token_encrypted text NOT NULL,
      refresh_token_encrypted text NOT NULL,
      access_expires_at timestamptz NOT NULL,
      refresh_expires_at timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reauthorization_required')),
      refreshed_at timestamptz NOT NULL DEFAULT now(),
      renewal_started_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX channel_connections_channel_account_id_key ON channel_connections (channel, account_id)');
}
