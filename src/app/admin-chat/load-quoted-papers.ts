import type { Transaction } from '../db/transaction.ts';
import { buildDocumentFactValuesSql, type DocumentFactValue } from '../facts/document-fact-values.ts';

export type QuotedPaper = {
  id: string;
  kind: string;
  title: string | null;
  status: 'accepted' | 'needs_review';
  stage: 'dispatch' | 'receipt' | null;
  document_number: string | null;
  document_date: string | null;
  plate: string | null;
  summary: string;
  sender: string | null;
  sent_at: string;
  lines: { item: string | null; label: string; value: string }[];
  parties: { role: string; name: string }[];
  fact_values: DocumentFactValue[];
};

const SELECT_QUOTED_PAPERS_SQL = `
  SELECT document.id, document.kind, document.title, document.status, document.stage, document.document_number,
    to_char(document.document_date, 'DD/MM/YYYY') AS document_date, document.vehicle_plate AS plate, document.summary,
    membership.display_name AS sender,
    to_char(COALESCE((event.payload->>'sent_at')::timestamptz, message.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY') AS sent_at,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('item', line.item, 'label', line.label, 'value', line.value) ORDER BY line.line_no)
      FROM document_lines line WHERE line.document_id = document.id), '[]'::jsonb) AS lines,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('role', party.role, 'name', party.printed_name) ORDER BY party.created_at, party.id)
      FROM document_parties party WHERE party.document_id = document.id), '[]'::jsonb) AS parties,
    ${buildDocumentFactValuesSql()} AS fact_values
  FROM document_sources source
  JOIN documents document ON document.id = source.document_id AND document.workspace_id = source.workspace_id
  JOIN messages message ON message.id = source.message_id AND message.workspace_id = source.workspace_id
  LEFT JOIN inbound_events event ON event.id = message.inbound_event_id
  LEFT JOIN memberships membership ON membership.workspace_id = message.workspace_id AND membership.user_id = message.user_id
  WHERE source.workspace_id = $1 AND source.message_id = $2
  ORDER BY source.item_index`;

export function loadQuotedPapers(transaction: Transaction, workspaceId: string, photoMessageId: string): Promise<QuotedPaper[]> {
  return transaction.query<QuotedPaper>(SELECT_QUOTED_PAPERS_SQL, [workspaceId, photoMessageId]);
}
