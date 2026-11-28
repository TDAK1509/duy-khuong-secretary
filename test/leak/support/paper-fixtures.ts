import { runInTransaction, type Database } from '../../../src/app/db/transaction.ts';
import { scopeDatabase } from '../../../src/app/db/scoped-database.ts';
import { linkEntryToMatchingDocuments } from '../../../src/app/facts/link-facts.ts';
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

export type EntrySpec = {
  plate?: string;
  pickup?: string;
  dropoff?: string;
  goods?: string;
  customer?: string;
  thenDropoff?: string;
  shownGoodsName?: string;
  wageVnd?: number;
  ratePerTonVnd?: number;
  allowanceVnd?: number;
  note?: string;
};

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

export async function insertEntry(owner: PostgresPool, spec: EntrySpec): Promise<string> {
  const { rows } = await owner.query<{ id: string }>(
    `INSERT INTO company_knowledge_entries (workspace_id, author_user_id, statement, when_vehicle_plate, when_goods,
       when_pickup_name, when_pickup_match_key, when_dropoff_name, when_dropoff_match_key, then_customer, then_dropoff, then_shown_goods_name, then_wage_vnd, then_rate_vnd_per_ton, then_allowance_vnd, then_note)
     VALUES ($1, $2, 'fixture entry', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
    [WORKSPACE_A_ID, A_ADMIN_USER_ID, spec.plate ?? null, spec.goods ?? null, spec.pickup ?? null, readMatchKey(spec.pickup), spec.dropoff ?? null, readMatchKey(spec.dropoff),
      spec.customer ?? null, spec.thenDropoff ?? null, spec.shownGoodsName ?? null, spec.wageVnd ?? null, spec.ratePerTonVnd ?? null, spec.allowanceVnd ?? null, spec.note ?? (hasOutcome(spec) ? null : 'fixture note')],
  );
  return rows[0]?.id ?? '';
}

function hasOutcome(spec: EntrySpec): boolean {
  return [spec.customer, spec.thenDropoff, spec.shownGoodsName, spec.wageVnd, spec.ratePerTonVnd, spec.allowanceVnd].some((outcome) => outcome !== undefined);
}

function readMatchKey(name: string | undefined): string | null {
  return name === undefined ? null : buildMatchKey(name);
}

export async function linkEntry(runtime: PostgresPool, entryId: string): Promise<void> {
  await runInTransaction(openWorkspaceA(runtime), (transaction) => linkEntryToMatchingDocuments(transaction, WORKSPACE_A_ID, entryId));
}

export function openWorkspaceA(runtime: PostgresPool): Database {
  return scopeDatabase(runtime, { workspaceId: WORKSPACE_A_ID });
}

export async function listLinkedPaperIds(owner: PostgresPool, entryId: string): Promise<string[]> {
  const { rows } = await owner.query<{ document_id: string }>('SELECT document_id FROM company_knowledge_links WHERE entry_id = $1 ORDER BY document_id', [entryId]);
  return rows.map((row) => row.document_id);
}

export async function addCompanyAlias(owner: PostgresPool, companyName: string, alias: string): Promise<void> {
  const organizationId = await ensureOrganization(owner, companyName);
  await owner.query('INSERT INTO organization_aliases (workspace_id, organization_id, printed_name, match_key) VALUES ($1, $2, $3, $4)', [WORKSPACE_A_ID, organizationId, alias, buildMatchKey(alias)]);
}
