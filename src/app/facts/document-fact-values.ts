export type DocumentFactValue = { key: string; name: string; number: string | null; unit: string | null; text: string | null };

export function buildDocumentFactValuesSql(): string {
  return `COALESCE((
    SELECT jsonb_agg(jsonb_build_object('key', winner.match_key, 'name', winner.name, 'number', winner.number::text, 'unit', winner.unit, 'text', winner.text_value) ORDER BY winner.name)
    FROM (
      SELECT DISTINCT ON (value.match_key) value.match_key, value.name, value.number, value.unit, value.text_value
      FROM document_facts link
      JOIN facts fact ON fact.id = link.fact_id
      JOIN fact_values value ON value.fact_id = fact.id
      WHERE link.document_id = document.id
      ORDER BY value.match_key, fact.updated_at DESC, fact.id
    ) winner
  ), '[]'::jsonb)`;
}
