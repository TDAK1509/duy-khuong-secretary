import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE channel_identities (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      channel text NOT NULL,
      account_id text NOT NULL,
      external_user_id text NOT NULL,
      user_id uuid REFERENCES users (id) ON DELETE SET NULL,
      zalo_name text,
      current_workspace_id uuid REFERENCES workspaces (id) ON DELETE SET NULL,
      last_inbound_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(
    'CREATE UNIQUE INDEX channel_identities_channel_account_id_external_user_id_key ON channel_identities (channel, account_id, external_user_id)',
  );
  pgm.sql('CREATE UNIQUE INDEX channel_identities_user_id_key ON channel_identities (user_id) WHERE user_id IS NOT NULL');
}
