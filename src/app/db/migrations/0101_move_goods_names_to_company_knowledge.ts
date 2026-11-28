import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

const OUTCOME_CHECK = 'company_knowledge_entries_check3';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['company_knowledge_entries', 'company_knowledge_links', 'goods_names']);
  addShownGoodsName(pgm);
  moveGoodsNames(pgm);
}

function addShownGoodsName(pgm: MigrationBuilder): void {
  pgm.sql(`ALTER TABLE company_knowledge_entries ADD COLUMN then_shown_goods_name text CHECK (then_shown_goods_name IS NULL OR char_length(btrim(then_shown_goods_name)) BETWEEN 1 AND 80)`);
  pgm.sql(`ALTER TABLE company_knowledge_entries DROP CONSTRAINT ${OUTCOME_CHECK}`);
  pgm.sql(`
    ALTER TABLE company_knowledge_entries ADD CONSTRAINT ${OUTCOME_CHECK}
    CHECK (then_customer IS NOT NULL OR then_dropoff IS NOT NULL OR then_shown_goods_name IS NOT NULL OR then_wage_vnd IS NOT NULL OR then_rate_vnd_per_ton IS NOT NULL OR then_allowance_vnd IS NOT NULL OR then_note IS NOT NULL)
  `);
}

const INSERT_ENTRIES_SQL = `
  INSERT INTO company_knowledge_entries (id, workspace_id, author_user_id, statement, when_goods, then_shown_goods_name, created_at, updated_at)
  SELECT id, workspace_id, author_user_id, written_name || ' → ' || shown_name, written_name, shown_name, created_at, created_at
  FROM goods_names
`;

const LINK_ENTRIES_SQL = `
  INSERT INTO company_knowledge_links (workspace_id, document_id, entry_id)
  SELECT document.workspace_id, document.id, entry.id
  FROM company_knowledge_entries entry
  JOIN goods_names moved ON moved.id = entry.id
  CROSS JOIN LATERAL (SELECT nullif(regexp_replace(lower(unaccent(entry.when_goods)), '[^a-z0-9]', '', 'g'), '') AS key,
    coalesce((SELECT array_agg(DISTINCT token) FROM regexp_split_to_table(lower(unaccent(entry.when_goods)), '[^a-z0-9]+') token WHERE token <> ''), '{}') AS tokens) entry_goods
  JOIN documents document ON document.workspace_id = entry.workspace_id
  WHERE entry_goods.key IS NOT NULL AND EXISTS (
    SELECT 1 FROM (
      SELECT line.value AS text FROM document_lines line
      WHERE line.document_id = document.id AND line.item IS NULL AND regexp_replace(lower(unaccent(line.label)), '[^a-z0-9]', '', 'g') = 'hanghoa'
      UNION ALL
      SELECT line.item AS text FROM document_lines line WHERE line.document_id = document.id AND line.item IS NOT NULL
    ) goods
    WHERE regexp_replace(lower(unaccent(goods.text)), '[^a-z0-9]', '', 'g') = entry_goods.key OR NOT EXISTS (
      SELECT 1 FROM unnest(entry_goods.tokens) wanted
      WHERE NOT EXISTS (SELECT 1 FROM regexp_split_to_table(lower(unaccent(goods.text)), '[^a-z0-9]+') token WHERE token <> '' AND (wanted = token OR (length(wanted) >= 4 AND starts_with(token, wanted)) OR (length(token) >= 4 AND starts_with(wanted, token))))
    )
  )
  ON CONFLICT DO NOTHING
`;

function moveGoodsNames(pgm: MigrationBuilder): void {
  pgm.sql(`
    DO $move_goods_names$
    DECLARE moved integer; inserted integer; linked integer;
    BEGIN
      SELECT count(*) INTO moved FROM goods_names;
      WITH new_entries AS (${INSERT_ENTRIES_SQL} RETURNING 1) SELECT count(*) INTO inserted FROM new_entries;
      ${LINK_ENTRIES_SQL};
      SELECT count(DISTINCT link.document_id) INTO linked FROM company_knowledge_links link WHERE link.entry_id IN (SELECT id FROM goods_names);
      RAISE NOTICE '[migration] goods_names_moved=% entries_inserted=% papers_linked=%', moved, inserted, linked;
    END
    $move_goods_names$
  `);
}
