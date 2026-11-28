import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['company_knowledge_entries']);
  pgm.sql('ALTER TABLE company_knowledge_entries ADD COLUMN then_equal_weights boolean NOT NULL DEFAULT false');
  pgm.sql('ALTER TABLE company_knowledge_entries DROP CONSTRAINT company_knowledge_entries_check3');
  pgm.sql(`
    ALTER TABLE company_knowledge_entries ADD CONSTRAINT company_knowledge_entries_has_outcome_check CHECK (
      then_customer IS NOT NULL OR then_dropoff IS NOT NULL OR then_wage_vnd IS NOT NULL OR then_rate_vnd_per_ton IS NOT NULL
      OR then_allowance_vnd IS NOT NULL OR then_note IS NOT NULL OR then_equal_weights
    )
  `);
}
