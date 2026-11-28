import type { MigrationBuilder } from '../migration-builder.ts';

const OUTCOME_CHECK = 'company_knowledge_entries_check3';

export function up(pgm: MigrationBuilder): void {
  addShownGoodsName(pgm);
}

function addShownGoodsName(pgm: MigrationBuilder): void {
  pgm.sql(`ALTER TABLE company_knowledge_entries ADD COLUMN then_shown_goods_name text CHECK (then_shown_goods_name IS NULL OR char_length(btrim(then_shown_goods_name)) BETWEEN 1 AND 80)`);
  pgm.sql(`ALTER TABLE company_knowledge_entries DROP CONSTRAINT ${OUTCOME_CHECK}`);
  pgm.sql(`
    ALTER TABLE company_knowledge_entries ADD CONSTRAINT ${OUTCOME_CHECK}
    CHECK (then_customer IS NOT NULL OR then_dropoff IS NOT NULL OR then_shown_goods_name IS NOT NULL OR then_wage_vnd IS NOT NULL OR then_rate_vnd_per_ton IS NOT NULL OR then_allowance_vnd IS NOT NULL OR then_note IS NOT NULL)
  `);
}
