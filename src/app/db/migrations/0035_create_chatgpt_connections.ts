import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE chatgpt_connections (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      membership_id uuid NOT NULL REFERENCES memberships (id) ON DELETE CASCADE,
      client_id text NOT NULL,
      access_token_hash text NOT NULL UNIQUE,
      access_expires_at timestamptz NOT NULL,
      refresh_token_hash text NOT NULL UNIQUE,
      refresh_expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql('CREATE INDEX chatgpt_connections_membership_idx ON chatgpt_connections (membership_id)');
}
