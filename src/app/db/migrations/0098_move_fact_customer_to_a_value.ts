import { CUSTOMER_VALUE_KEY, CUSTOMER_VALUE_NAME, GOODS_VALUE_KEY } from '../../facts/fact.ts';
import { LINK_MATCHES_SQL } from '../../facts/link-facts.ts';
import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

const WITHOUT_CUSTOMER_VALUE = `NOT EXISTS (SELECT 1 FROM fact_values value WHERE value.fact_id = fact.id AND value.match_key = '${CUSTOMER_VALUE_KEY}')`;

const FACT_GOODS_KEY = `coalesce((SELECT regexp_replace(lower(unaccent(value.text_value)), '[^a-z0-9]', '', 'g') FROM fact_values value WHERE value.fact_id = fact.id AND value.match_key = '${GOODS_VALUE_KEY}'), '')`;

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['document_facts', 'fact_companies', 'fact_values', 'facts']);
  pgm.sql('CREATE TEMP TABLE migration_counts (name text PRIMARY KEY, count integer NOT NULL) ON COMMIT DROP');
  addCustomerValues(pgm);
  dropCustomerPicks(pgm);
  mergeFactsOfTheSameRoute(pgm);
  pgm.sql('DELETE FROM document_facts');
  pgm.sql('ALTER TABLE facts DROP COLUMN customer_name, DROP COLUMN customer_match_key, DROP COLUMN customer_resolved');
  relinkFacts(pgm);
  logCounts(pgm);
}

function addCustomerValues(pgm: MigrationBuilder): void {
  pgm.sql(`
    WITH added AS (
      INSERT INTO fact_values (workspace_id, fact_id, position, name, match_key, text_value)
      SELECT fact.workspace_id, fact.id,
        (SELECT coalesce(max(value.position) + 1, 0) FROM fact_values value WHERE value.fact_id = fact.id),
        '${CUSTOMER_VALUE_NAME}', '${CUSTOMER_VALUE_KEY}', fact.customer_name
      FROM facts fact
      WHERE fact.customer_name IS NOT NULL AND ${WITHOUT_CUSTOMER_VALUE}
      RETURNING 1
    )
    INSERT INTO migration_counts SELECT 'customer_values_added', count(*) FROM added
  `);
}

function dropCustomerPicks(pgm: MigrationBuilder): void {
  pgm.sql(`DELETE FROM fact_companies WHERE slot = 'customer'`);
  pgm.sql('ALTER TABLE fact_companies DROP CONSTRAINT fact_companies_slot_check');
  pgm.sql(`ALTER TABLE fact_companies ADD CONSTRAINT fact_companies_slot_check CHECK (slot IN ('pickup', 'dropoff'))`);
}

function mergeFactsOfTheSameRoute(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TEMP TABLE route_fact_ranks ON COMMIT DROP AS
    SELECT fact.id, fact.workspace_id,
      first_value(fact.id) OVER same_route AS newest_id,
      row_number() OVER same_route AS rank
    FROM facts fact
    WHERE fact.pickup_match_key IS NOT NULL OR fact.dropoff_match_key IS NOT NULL
    WINDOW same_route AS (
      PARTITION BY fact.workspace_id, fact.vehicle_plate, fact.driver_user_id, fact.pickup_match_key, fact.dropoff_match_key, ${FACT_GOODS_KEY}
      ORDER BY fact.updated_at DESC, fact.created_at DESC, fact.id DESC
    )
  `);
  pgm.sql(`
    INSERT INTO fact_values (workspace_id, fact_id, position, name, match_key, number, unit, text_value)
    SELECT only_older.workspace_id, only_older.newest_id,
      ((SELECT coalesce(max(newest.position) + 1, 0) FROM fact_values newest WHERE newest.fact_id = only_older.newest_id)
        + row_number() OVER (PARTITION BY only_older.newest_id ORDER BY only_older.rank, only_older.position) - 1)::smallint,
      only_older.name, only_older.match_key, only_older.number, only_older.unit, only_older.text_value
    FROM (
      SELECT DISTINCT ON (older.newest_id, value.match_key) older.newest_id, older.workspace_id, older.rank, value.position,
        value.name, value.match_key, value.number, value.unit, value.text_value
      FROM route_fact_ranks older JOIN fact_values value ON value.fact_id = older.id
      WHERE older.rank > 1
        AND NOT EXISTS (SELECT 1 FROM fact_values newest WHERE newest.fact_id = older.newest_id AND newest.match_key = value.match_key)
      ORDER BY older.newest_id, value.match_key, older.rank
    ) only_older
  `);
  pgm.sql(`
    WITH merged AS (DELETE FROM facts WHERE id IN (SELECT id FROM route_fact_ranks WHERE rank > 1) RETURNING 1)
    INSERT INTO migration_counts SELECT 'facts_merged', count(*) FROM merged
  `);
}

function relinkFacts(pgm: MigrationBuilder): void {
  pgm.sql(`
    DO $relink$
    DECLARE workspace record;
    BEGIN
      FOR workspace IN SELECT id FROM workspaces LOOP
        EXECUTE $link$${LINK_MATCHES_SQL}$link$ USING workspace.id, NULL::uuid, NULL::uuid[];
      END LOOP;
    END
    $relink$
  `);
  pgm.sql(`INSERT INTO migration_counts SELECT 'facts_relinked', count(*) FROM facts`);
}

function logCounts(pgm: MigrationBuilder): void {
  pgm.sql(`
    DO $log$
    BEGIN
      RAISE NOTICE '[migration] customer_values_added=% facts_merged=% facts_relinked=%',
        (SELECT count FROM migration_counts WHERE name = 'customer_values_added'),
        (SELECT count FROM migration_counts WHERE name = 'facts_merged'),
        (SELECT count FROM migration_counts WHERE name = 'facts_relinked');
    END
    $log$
  `);
}
