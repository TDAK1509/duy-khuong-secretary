import type { Transaction } from '../../db/transaction.ts';
import { JOIN_PHOTO_AND_RECORD_OF_SOURCE_SQL, PHOTO_IS_NOT_DELETED_SQL } from './usable-example-photo.ts';

export type ExpectedReading = {
  category: string;
  document_title: string | null;
  maintenance_item: string | null;
  occurred_on: string | null;
  amount_vnd: number | null;
  identifiers: string[];
  vehicle_plate: string | null;
  document_number: string | null;
  document_kind: string;
  stage: 'dispatch' | 'receipt' | null;
  parties: ExampleParty[];
  details: ExampleDetail[];
  template: null;
};

export type ExamplePaper = { documentId: string; imageKey: string; expectedReading: ExpectedReading };

export type FoundExamplePapers = { papers: ExamplePaper[]; unusableIds: string[] };

type ExampleParty = { role: string; type: string; printed_name: string; known_name: string | null };

type ExampleDetail = { label: string; value: string; number: number | null; unit: string | null; meaning: string | null; item: string | null; date_time: string | null };

type PaperRow = Omit<ExpectedReading, 'parties' | 'details' | 'template'> & { document_id: string; image_key: string };

const FIND_PAPER_SQL = `
  SELECT document.id AS document_id, message.image_key, record.category, document.title AS document_title, record.maintenance_item,
    to_char(record.occurred_on, 'YYYY-MM-DD') AS occurred_on, record.amount_vnd::float8 AS amount_vnd, record.identifiers,
    document.vehicle_plate, document.document_number, document.kind AS document_kind, document.stage
  FROM documents document
  JOIN document_sources source ON source.document_id = document.id AND source.workspace_id = document.workspace_id
  ${JOIN_PHOTO_AND_RECORD_OF_SOURCE_SQL}
  WHERE document.workspace_id = $1 AND document.status = 'accepted'
    AND (
      document.id = $2
      OR document.id IN (
        SELECT paper_source.document_id FROM records paper_record
        JOIN document_sources paper_source ON paper_source.message_id = paper_record.message_id AND paper_source.item_index = paper_record.item_index
        WHERE paper_record.id = $2 AND paper_record.workspace_id = $1
      )
    )
    AND ${PHOTO_IS_NOT_DELETED_SQL}
  ORDER BY source.created_at, source.id
  LIMIT 1`;

const FIND_PARTIES_SQL = `
  SELECT party.role, party.type, party.printed_name, organization.name AS known_name
  FROM document_parties party
  LEFT JOIN organizations organization ON organization.id = party.organization_id AND organization.workspace_id = party.workspace_id
  WHERE party.document_id = $2 AND party.workspace_id = $1
  ORDER BY party.created_at, party.id`;

const FIND_DETAILS_SQL = `
  SELECT line.label, line.value, line.number::float8 AS number, line.unit, meaning.name AS meaning, line.item,
    CASE
      WHEN line.at IS NULL THEN NULL
      WHEN line.at::time = '00:00:00' THEN to_char(line.at, 'YYYY-MM-DD')
      ELSE to_char(line.at, 'YYYY-MM-DD"T"HH24:MI:SS')
    END AS date_time
  FROM document_lines line
  LEFT JOIN meanings meaning ON meaning.id = line.meaning_id AND meaning.workspace_id = line.workspace_id
  WHERE line.document_id = $2 AND line.workspace_id = $1
  ORDER BY line.line_no`;

export async function findExamplePapers(transaction: Transaction, workspaceId: string, paperIds: string[]): Promise<FoundExamplePapers> {
  const found: FoundExamplePapers = { papers: [], unusableIds: [] };
  for (const paperId of paperIds) {
    const paper = await findExamplePaper(transaction, workspaceId, paperId);
    const isUsable = paper !== null && !found.papers.some(({ imageKey }) => imageKey === paper.imageKey);
    if (isUsable) found.papers.push(paper);
    else found.unusableIds.push(paperId);
  }
  return found;
}

async function findExamplePaper(transaction: Transaction, workspaceId: string, paperId: string): Promise<ExamplePaper | null> {
  const [row] = await transaction.query<PaperRow>(FIND_PAPER_SQL, [workspaceId, paperId]);
  if (row === undefined) return null;
  const { document_id: documentId, image_key: imageKey, ...reading } = row;
  const parties = await transaction.query<ExampleParty>(FIND_PARTIES_SQL, [workspaceId, documentId]);
  const details = await transaction.query<ExampleDetail>(FIND_DETAILS_SQL, [workspaceId, documentId]);
  return { documentId, imageKey, expectedReading: { ...reading, parties, details, template: null } };
}
