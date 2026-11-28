import { runInTransaction, type Database } from '../../../src/app/db/transaction.ts';
import { scopeDatabase } from '../../../src/app/db/scoped-database.ts';
import { linkFactToMatchingDocuments } from '../../../src/app/facts/link-facts.ts';
import { buildMatchKey } from '../../../src/app/documents/build-match-key.ts';
import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { A_ADMIN_USER_ID, WORKSPACE_A_ID } from './seed-ids.ts';

export type PaperParty = { role: 'issuer' | 'supplier' | 'customer' | 'carrier' | 'place'; name: string };

export type PaperLine = { label: string; value: string; item?: string };

export type PaperSpec = {
  kind?: string;
  stage?: 'dispatch' | 'receipt' | null;
  plate?: string | null;
  date?: string;
  at?: string;
  weightKg?: number;
  parties: PaperParty[];
  lines?: PaperLine[];
};

export type FactSpec = {
  plate?: string;
  pickup?: string;
  dropoff?: string;
  values?: FactValueSpec[];
};

export type FactValueSpec = { name: string; number?: number; unit?: string; text?: string };

const WEIGHT_MEANING = 'Trọng lượng hàng';
const TIME_MEANING = 'Giờ cân';

export async function insertPaper(owner: PostgresPool, spec: PaperSpec): Promise<string> {
  const kind = spec.kind ?? 'weigh-ticket';
  const { rows } = await owner.query<{ id: string }>(
    `INSERT INTO documents (workspace_id, kind, stage, document_date, vehicle_plate, summary) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [WORKSPACE_A_ID, kind, spec.stage === undefined ? 'dispatch' : spec.stage, spec.date ?? '2026-03-05', spec.plate === undefined ? null : spec.plate, `fixture ${kind}`],
  );
  const documentId = rows[0]?.id ?? '';
  for (const party of spec.parties) await insertParty(owner, documentId, party);
  await insertLines(owner, documentId, spec);
  return documentId;
}

async function insertParty(owner: PostgresPool, documentId: string, { role, name }: PaperParty): Promise<void> {
  const organizationId = await ensureOrganization(owner, name);
  await owner.query(
    `INSERT INTO document_parties (workspace_id, document_id, role, type, printed_name, match_key, organization_id) VALUES ($1, $2, $3, 'company', $4, $5, $6)`,
    [WORKSPACE_A_ID, documentId, role, name, buildMatchKey(name), organizationId],
  );
}

async function ensureOrganization(owner: PostgresPool, name: string): Promise<string> {
  const existing = await owner.query<{ id: string }>('SELECT id FROM organizations WHERE workspace_id = $1 AND name = $2', [WORKSPACE_A_ID, name]);
  if (existing.rows[0] !== undefined) return existing.rows[0].id;
  const { rows } = await owner.query<{ id: string }>(`INSERT INTO organizations (workspace_id, type, name) VALUES ($1, 'company', $2) RETURNING id`, [WORKSPACE_A_ID, name]);
  const organizationId = rows[0]?.id ?? '';
  await owner.query('INSERT INTO organization_aliases (workspace_id, organization_id, printed_name, match_key) VALUES ($1, $2, $3, $4)', [WORKSPACE_A_ID, organizationId, name, buildMatchKey(name)]);
  return organizationId;
}

async function insertLines(owner: PostgresPool, documentId: string, spec: PaperSpec): Promise<void> {
  let lineNo = 0;
  for (const line of spec.lines ?? []) {
    await owner.query('INSERT INTO document_lines (workspace_id, document_id, line_no, label, value, item) VALUES ($1, $2, $3, $4, $5, $6)', [WORKSPACE_A_ID, documentId, lineNo, line.label, line.value, line.item ?? null]);
    lineNo += 1;
  }
  if (spec.weightKg !== undefined) {
    const meaningId = await ensureMeaning(owner, 'number', WEIGHT_MEANING);
    await owner.query(
      `INSERT INTO document_lines (workspace_id, document_id, line_no, label, value, number, unit, meaning_id) VALUES ($1, $2, $3, $4, $5, $6, 'kg', $7)`,
      [WORKSPACE_A_ID, documentId, lineNo, WEIGHT_MEANING, `${spec.weightKg} kg`, spec.weightKg, meaningId],
    );
    lineNo += 1;
  }
  if (spec.at !== undefined) {
    const meaningId = await ensureMeaning(owner, 'date', TIME_MEANING);
    await owner.query(
      'INSERT INTO document_lines (workspace_id, document_id, line_no, label, value, at, meaning_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [WORKSPACE_A_ID, documentId, lineNo, TIME_MEANING, spec.at, spec.at, meaningId],
    );
  }
}

async function ensureMeaning(owner: PostgresPool, valueType: 'number' | 'date', name: string): Promise<string> {
  const { rows } = await owner.query<{ id: string }>(
    `INSERT INTO meanings (workspace_id, value_type, name, match_key) VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id, value_type, match_key) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [WORKSPACE_A_ID, valueType, name, buildMatchKey(name)],
  );
  return rows[0]?.id ?? '';
}

export async function insertFact(owner: PostgresPool, spec: FactSpec): Promise<string> {
  const { rows } = await owner.query<{ id: string }>(
    `INSERT INTO facts (workspace_id, author_user_id, statement, vehicle_plate, pickup_name, pickup_match_key, dropoff_name, dropoff_match_key)
     VALUES ($1, $2, 'fixture fact', $3, $4, $5, $6, $7) RETURNING id`,
    [WORKSPACE_A_ID, A_ADMIN_USER_ID, spec.plate ?? null, spec.pickup ?? null, spec.pickup === undefined ? null : buildMatchKey(spec.pickup), spec.dropoff ?? null, spec.dropoff === undefined ? null : buildMatchKey(spec.dropoff)],
  );
  const factId = rows[0]?.id ?? '';
  for (const [position, value] of (spec.values ?? []).entries()) await insertFactValue(owner, factId, position, value);
  return factId;
}

async function insertFactValue(owner: PostgresPool, factId: string, position: number, { name, number, unit, text }: FactValueSpec): Promise<void> {
  await owner.query(
    'INSERT INTO fact_values (workspace_id, fact_id, position, name, match_key, number, unit, text_value) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [WORKSPACE_A_ID, factId, position, name, buildMatchKey(name), number ?? null, unit ?? null, text ?? null],
  );
}

export async function linkFact(runtime: PostgresPool, factId: string): Promise<void> {
  await runInTransaction(openWorkspaceA(runtime), (transaction) => linkFactToMatchingDocuments(transaction, WORKSPACE_A_ID, factId));
}

export function openWorkspaceA(runtime: PostgresPool): Database {
  return scopeDatabase(runtime, { workspaceId: WORKSPACE_A_ID });
}

export async function listLinkedPaperIds(owner: PostgresPool, factId: string): Promise<string[]> {
  const { rows } = await owner.query<{ document_id: string }>('SELECT document_id FROM document_facts WHERE fact_id = $1 ORDER BY document_id', [factId]);
  return rows.map((row) => row.document_id);
}
