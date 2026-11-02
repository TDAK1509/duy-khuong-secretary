import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE users (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(`
    CREATE TABLE workspaces (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(`
    CREATE TABLE memberships (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      role text NOT NULL CHECK (role IN ('admin', 'member')),
      display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql('CREATE UNIQUE INDEX memberships_workspace_id_user_id_key ON memberships (workspace_id, user_id)');
  pgm.sql('CREATE INDEX memberships_user_id_idx ON memberships (user_id)');
  pgm.sql(`
    CREATE TABLE workspace_invites (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
      code_hash text NOT NULL UNIQUE,
      display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
      role text NOT NULL CHECK (role IN ('admin', 'member')),
      created_by uuid REFERENCES users (id) ON DELETE SET NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      used_by uuid REFERENCES users (id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql('CREATE INDEX workspace_invites_workspace_id_idx ON workspace_invites (workspace_id)');
}
