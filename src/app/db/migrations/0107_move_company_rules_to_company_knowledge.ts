import type { MigrationBuilder } from '../migration-builder.ts';

const CONDITION_CHECK = 'company_knowledge_entries_check2';

export function up(pgm: MigrationBuilder): void {
  allowNoteOnlyEntries(pgm);
}

function allowNoteOnlyEntries(pgm: MigrationBuilder): void {
  pgm.sql(`ALTER TABLE company_knowledge_entries DROP CONSTRAINT ${CONDITION_CHECK}`);
  pgm.sql(`
    ALTER TABLE company_knowledge_entries ADD CONSTRAINT ${CONDITION_CHECK}
    CHECK ((when_goods IS NOT NULL OR when_vehicle_plate IS NOT NULL OR when_driver_user_id IS NOT NULL OR when_pickup_match_key IS NOT NULL OR when_dropoff_match_key IS NOT NULL) OR then_note IS NOT NULL)
  `);
}
