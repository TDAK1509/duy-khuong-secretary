import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['users']);
  pgm.sql('ALTER TABLE users ADD COLUMN is_internal boolean NOT NULL DEFAULT false');
  pgm.sql('REVOKE INSERT, UPDATE ON users FROM app_runtime');
  pgm.sql('GRANT INSERT (id, created_at) ON users TO app_runtime');
  createInternalLoginCodes(pgm);
  createInternalSessions(pgm);
}

function createInternalLoginCodes(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE internal_login_codes (
      user_id uuid NOT NULL PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
      code_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

function createInternalSessions(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE internal_sessions (
      token_hash text NOT NULL PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}
