import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE chatgpt_login_codes (
      user_id uuid NOT NULL PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
      membership_id uuid NOT NULL REFERENCES memberships (id) ON DELETE CASCADE,
      code_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(`
    CREATE TABLE chatgpt_sign_ins (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      browser_key_hash text NOT NULL UNIQUE,
      client_id text NOT NULL,
      redirect_uri text NOT NULL,
      state text,
      code_challenge text NOT NULL,
      failed_attempts smallint NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
      membership_id uuid REFERENCES memberships (id) ON DELETE CASCADE,
      authorization_code_hash text UNIQUE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((membership_id IS NULL) = (authorization_code_hash IS NULL))
    )
  `);
}
