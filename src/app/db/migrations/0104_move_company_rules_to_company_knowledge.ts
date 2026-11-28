import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

const CONDITION_CHECK = 'company_knowledge_entries_check2';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['company_knowledge_entries', 'workspace_rules']);
  allowNoteOnlyEntries(pgm);
  moveRules(pgm);
  pgm.sql('DROP TABLE workspace_rules');
}

function allowNoteOnlyEntries(pgm: MigrationBuilder): void {
  pgm.sql(`ALTER TABLE company_knowledge_entries DROP CONSTRAINT ${CONDITION_CHECK}`);
  pgm.sql(`
    ALTER TABLE company_knowledge_entries ADD CONSTRAINT ${CONDITION_CHECK}
    CHECK ((when_goods IS NOT NULL OR when_vehicle_plate IS NOT NULL OR when_driver_user_id IS NOT NULL OR when_pickup_match_key IS NOT NULL OR when_dropoff_match_key IS NOT NULL) OR then_note IS NOT NULL)
  `);
}

const NORMALIZE_RULE_SQL = `btrim(regexp_replace(regexp_replace(lower(btrim(rule)), '\\s+', ' ', 'g'), '^["''“”‘’]+|["''“”‘’]+$', '', 'g'))`;

const INSERT_NOTES_SQL = `
  INSERT INTO company_knowledge_entries (id, workspace_id, author_user_id, statement, then_note, created_at, updated_at)
  SELECT DISTINCT ON (workspace_id, ${NORMALIZE_RULE_SQL}) id, workspace_id, author_user_id, rule, rule, created_at, created_at
  FROM workspace_rules
  ORDER BY workspace_id, ${NORMALIZE_RULE_SQL}, created_at, id
`;

function moveRules(pgm: MigrationBuilder): void {
  pgm.sql(`
    DO $move_rules$
    DECLARE moved integer; inserted integer;
    BEGIN
      SELECT count(*) INTO moved FROM workspace_rules;
      WITH new_entries AS (${INSERT_NOTES_SQL} RETURNING 1) SELECT count(*) INTO inserted FROM new_entries;
      RAISE NOTICE '[migration] rules_moved=% duplicates_merged=% note_entries_inserted=%', moved, moved - inserted, inserted;
    END
    $move_rules$
  `);
}
