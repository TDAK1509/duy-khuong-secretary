import type { Database } from '../db/transaction.ts';
import { MAX_FIELDS_PER_TEMPLATE } from './document-template.ts';

export type ProposedField = { name: string; valueType: string; unit: string | null; paperCount: number };

export type TemplateProposal = {
  issuerName: string | null;
  kind: string;
  paperCount: number;
  stageCounts: { dispatch: number; receipt: number; none: number };
  fields: ProposedField[];
};

const MAX_PROPOSALS = 5;

const ACCEPTED_PAPERS_SQL = `
  accepted_papers AS (
    SELECT document.id, document.kind, document.stage,
      (SELECT party.organization_id FROM document_parties party
       WHERE party.document_id = document.id AND party.role = 'issuer' AND party.organization_id IS NOT NULL
       ORDER BY party.id LIMIT 1) AS issuer_id
    FROM documents document
    WHERE document.workspace_id = $1 AND document.status = 'accepted' AND document.sheet_signature IS NULL
  )`;

const FIND_GROUPS_SQL = `
  WITH ${ACCEPTED_PAPERS_SQL}
  SELECT organization.name AS issuer_name, paper.issuer_id, paper.kind, count(*)::int AS paper_count,
    count(*) FILTER (WHERE paper.stage = 'dispatch')::int AS dispatch_count,
    count(*) FILTER (WHERE paper.stage = 'receipt')::int AS receipt_count,
    count(*) FILTER (WHERE paper.stage IS NULL)::int AS none_count
  FROM accepted_papers paper
  LEFT JOIN organizations organization ON organization.id = paper.issuer_id
  GROUP BY paper.issuer_id, organization.name, paper.kind
  ORDER BY count(*) DESC, paper.kind COLLATE "C", paper.issuer_id
  LIMIT ${MAX_PROPOSALS}`;

const FIND_GROUP_FIELDS_SQL = `
  WITH ${ACCEPTED_PAPERS_SQL}
  SELECT wanted.ordinal::int AS ordinal, COALESCE(meaning.name, line.label) AS name, COALESCE(meaning.value_type, 'text') AS value_type,
    CASE WHEN meaning.value_type = 'number' THEN line.unit END AS unit, count(DISTINCT line.document_id)::int AS paper_count
  FROM unnest($2::uuid[], $3::text[]) WITH ORDINALITY AS wanted(issuer_id, kind, ordinal)
  JOIN accepted_papers paper ON paper.kind = wanted.kind AND paper.issuer_id IS NOT DISTINCT FROM wanted.issuer_id
  JOIN document_lines line ON line.document_id = paper.id AND line.workspace_id = $1
  LEFT JOIN meanings meaning ON meaning.id = line.meaning_id AND meaning.workspace_id = $1
  GROUP BY wanted.ordinal, COALESCE(meaning.name, line.label), COALESCE(meaning.value_type, 'text'), CASE WHEN meaning.value_type = 'number' THEN line.unit END
  ORDER BY wanted.ordinal, count(DISTINCT line.document_id) DESC, COALESCE(meaning.name, line.label) COLLATE "C"`;

const FIND_PAPER_SQL = `
  SELECT document.id, document.kind, document.stage, organization.name AS issuer_name
  FROM documents document
  LEFT JOIN LATERAL (
    SELECT party.organization_id FROM document_parties party
    WHERE party.document_id = document.id AND party.role = 'issuer' AND party.organization_id IS NOT NULL
    ORDER BY party.id LIMIT 1
  ) issuer ON true
  LEFT JOIN organizations organization ON organization.id = issuer.organization_id
  WHERE document.workspace_id = $1 AND (
    document.id = $2
    OR document.id IN (
      SELECT source.document_id FROM records record
      JOIN document_sources source ON source.message_id = record.message_id AND source.item_index = record.item_index
      WHERE record.id = $2 AND record.workspace_id = $1
    )
  )
  LIMIT 1`;

const FIND_PAPER_FIELDS_SQL = `
  SELECT COALESCE(meaning.name, line.label) AS name, COALESCE(meaning.value_type, 'text') AS value_type,
    CASE WHEN meaning.value_type = 'number' THEN line.unit END AS unit, 1 AS paper_count
  FROM document_lines line
  LEFT JOIN meanings meaning ON meaning.id = line.meaning_id AND meaning.workspace_id = $1
  WHERE line.workspace_id = $1 AND line.document_id = $2
  GROUP BY COALESCE(meaning.name, line.label), COALESCE(meaning.value_type, 'text'), CASE WHEN meaning.value_type = 'number' THEN line.unit END
  ORDER BY COALESCE(meaning.name, line.label) COLLATE "C"`;

type GroupRow = { issuer_name: string | null; issuer_id: string | null; kind: string; paper_count: number; dispatch_count: number; receipt_count: number; none_count: number };

type FieldRow = { ordinal: number; name: string; value_type: string; unit: string | null; paper_count: number };

type PaperRow = { id: string; kind: string; stage: string | null; issuer_name: string | null };

export async function proposeTemplatesFromPapers(database: Database, workspaceId: string): Promise<TemplateProposal[]> {
  const { rows: groups } = await database.query<GroupRow>(FIND_GROUPS_SQL, [workspaceId]);
  if (groups.length === 0) return [];
  const { rows: fields } = await database.query<FieldRow>(FIND_GROUP_FIELDS_SQL, [workspaceId, groups.map((group) => group.issuer_id), groups.map((group) => group.kind)]);
  return groups.map((group, index) => toGroupProposal(group, fields.filter((field) => field.ordinal === index + 1)));
}

export async function proposeTemplateFromPaper(database: Database, workspaceId: string, paperId: string): Promise<TemplateProposal | null> {
  const { rows: [paper] } = await database.query<PaperRow>(FIND_PAPER_SQL, [workspaceId, paperId]);
  if (paper === undefined) return null;
  const { rows: fields } = await database.query<FieldRow>(FIND_PAPER_FIELDS_SQL, [workspaceId, paper.id]);
  return toPaperProposal(paper, fields);
}

function toGroupProposal(group: GroupRow, fields: FieldRow[]): TemplateProposal {
  const stageCounts = { dispatch: group.dispatch_count, receipt: group.receipt_count, none: group.none_count };
  return { issuerName: group.issuer_name, kind: group.kind, paperCount: group.paper_count, stageCounts, fields: fields.slice(0, MAX_FIELDS_PER_TEMPLATE).map(toProposedField) };
}

function toPaperProposal(paper: PaperRow, fields: FieldRow[]): TemplateProposal {
  const stageCounts = { dispatch: paper.stage === 'dispatch' ? 1 : 0, receipt: paper.stage === 'receipt' ? 1 : 0, none: paper.stage === null ? 1 : 0 };
  return { issuerName: paper.issuer_name, kind: paper.kind, paperCount: 1, stageCounts, fields: fields.slice(0, MAX_FIELDS_PER_TEMPLATE).map(toProposedField) };
}

function toProposedField(row: FieldRow): ProposedField {
  return { name: row.name, valueType: row.value_type, unit: row.unit, paperCount: row.paper_count };
}
