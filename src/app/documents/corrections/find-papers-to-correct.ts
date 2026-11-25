import type { Transaction } from '../../db/transaction.ts';
import { WhereClause } from '../../records/where-clause.ts';
import type { FoundPaper, PaperPointer } from './paper-correction.ts';

export type FoundPapers = { papers: FoundPaper[]; total: number };

type FoundRow = FoundPaper & { total: number };

const SELECT_PAPERS_SQL = `
  SELECT document.id, document.kind, document.title, document.document_number,
    to_char(document.document_date, 'YYYY-MM-DD') AS document_date,
    document.vehicle_plate AS plate, document.stage, first_source.sender,
    to_char(first_source.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY') AS sent_at,
    count(*) OVER ()::int AS total
  FROM documents document
  LEFT JOIN LATERAL (
    SELECT membership.display_name AS sender, message.created_at AS sent_at
    FROM document_sources source
    JOIN messages message ON message.id = source.message_id AND message.workspace_id = source.workspace_id
    LEFT JOIN memberships membership ON membership.workspace_id = message.workspace_id AND membership.user_id = message.user_id
    WHERE source.document_id = document.id
    ORDER BY message.created_at, message.id
    LIMIT 1
  ) first_source ON true`;

export async function findPapersToCorrect(transaction: Transaction, workspaceId: string, pointer: PaperPointer, limit: number | null): Promise<FoundPapers> {
  const where = buildPointerWhere(workspaceId, pointer);
  const limitParameter = where.bind(limit);
  const rows = await transaction.query<FoundRow>(
    `${SELECT_PAPERS_SQL} WHERE ${where.toSql()} ORDER BY document.created_at DESC, document.id DESC LIMIT ${limitParameter}::int`,
    where.values,
  );
  return { papers: rows.map(toFoundPaper), total: rows[0]?.total ?? 0 };
}

function toFoundPaper(row: FoundRow): FoundPaper {
  return { id: row.id, kind: row.kind, title: row.title, document_number: row.document_number, document_date: row.document_date, plate: row.plate, stage: row.stage, sender: row.sender, sent_at: row.sent_at };
}

function buildPointerWhere(workspaceId: string, pointer: PaperPointer): WhereClause {
  const where = new WhereClause();
  where.require(`document.workspace_id = ${where.bind(workspaceId)}`);
  where.require(`document.status = 'accepted'`);
  if (pointer.plate !== null) where.require(`document.vehicle_plate = ${where.bind(pointer.plate)}`);
  if (pointer.documentNumber !== null) where.require(`document.document_number = ${where.bind(pointer.documentNumber)}`);
  if (pointer.documentDate !== null) where.require(`document.document_date = ${where.bind(pointer.documentDate)}::date`);
  if (pointer.lastPhotoMessageId !== null) where.require(buildFromMessage(where.bind(pointer.lastPhotoMessageId)));
  return where;
}

function buildFromMessage(messageParameter: string): string {
  return `EXISTS (SELECT 1 FROM document_sources photo_source WHERE photo_source.document_id = document.id AND photo_source.message_id = ${messageParameter}::uuid)`;
}
