import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
        CREATE ROLE app_runtime LOGIN NOSUPERUSER NOBYPASSRLS;
      END IF;
    END
    $$
  `);
  pgm.sql('GRANT USAGE ON SCHEMA public TO app_runtime');
  pgm.sql('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime');
  pgm.sql('REVOKE ALL ON pgmigrations FROM app_runtime');
  pgm.sql('GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_runtime');
  pgm.sql('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime');
  pgm.sql('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO app_runtime');
}
