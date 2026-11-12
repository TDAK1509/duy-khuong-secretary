import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['document_parties']);
  pgm.sql(`ALTER TABLE document_parties ADD COLUMN known_name text CHECK (known_name IS NULL OR btrim(known_name) <> '')`);
}
