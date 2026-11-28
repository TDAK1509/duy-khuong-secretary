import { buildOutcomeRowsSql } from './knowledge-outcomes.ts';

export type DocumentKnowledge = { key: string; name: string; number: string | null; unit: string | null; text: string | null };

const WINNER_FIELDS = `jsonb_build_object('key', winner.match_key, 'name', winner.name, 'number', winner.number::text, 'unit', winner.unit, 'text', winner.text_value)`;

export type SourcedKnowledge = DocumentKnowledge & { entry_id: string };

const SOURCED_WINNER_FIELDS = `${WINNER_FIELDS} || jsonb_build_object('entry_id', winner.entry_id)`;

export function buildDocumentKnowledgeSql(): string {
  return aggregateWinners(WINNER_FIELDS);
}

export function buildSourcedKnowledgeSql(): string {
  return aggregateWinners(SOURCED_WINNER_FIELDS);
}

function aggregateWinners(fields: string): string {
  return `COALESCE((SELECT jsonb_agg(${fields} ORDER BY winner.position) FROM (${buildWinnersSql()}) winner), '[]'::jsonb)`;
}

function buildWinnersSql(): string {
  return `SELECT DISTINCT ON (outcome.match_key) entry.id AS entry_id, outcome.position, outcome.match_key, outcome.name, outcome.number, outcome.unit, outcome.text_value
      FROM company_knowledge_links link
      JOIN company_knowledge_entries entry ON entry.id = link.entry_id AND entry.workspace_id = link.workspace_id
      CROSS JOIN LATERAL (${buildOutcomeRowsSql('entry')}) outcome
      WHERE link.document_id = document.id
      ORDER BY outcome.match_key, entry.updated_at DESC, entry.id DESC`;
}
