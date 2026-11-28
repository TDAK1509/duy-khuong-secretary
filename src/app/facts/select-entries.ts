import type { Transaction } from '../db/transaction.ts';
import type { KnowledgeOutcomes, StoredEntry, StoredSide } from './company-knowledge.ts';
import type { FactCompanySlot } from './pick-fact-companies.ts';

type EntryRow = {
  id: string;
  statement: string;
  author_name: string | null;
  when_goods: string | null;
  when_vehicle_plate: string | null;
  when_driver_user_id: string | null;
  driver_name: string | null;
  when_pickup_name: string | null;
  when_pickup_match_key: string | null;
  when_pickup_resolved: boolean;
  pickup_picks: string[];
  when_dropoff_name: string | null;
  when_dropoff_match_key: string | null;
  when_dropoff_resolved: boolean;
  dropoff_picks: string[];
  then_customer: string | null;
  then_dropoff: string | null;
  then_shown_goods_name: string | null;
  then_wage_vnd: string | null;
  then_rate_vnd_per_ton: string | null;
  then_allowance_vnd: string | null;
  then_note: string | null;
  linked_documents: number;
  updated_at: Date;
};

const SELECT_ENTRIES_SQL = `
  SELECT entry.id, entry.statement, author.display_name AS author_name,
    entry.when_goods, entry.when_vehicle_plate, entry.when_driver_user_id, driver.display_name AS driver_name,
    entry.when_pickup_name, entry.when_pickup_match_key, entry.when_pickup_resolved, ${buildPicksSql('pickup')} AS pickup_picks,
    entry.when_dropoff_name, entry.when_dropoff_match_key, entry.when_dropoff_resolved, ${buildPicksSql('dropoff')} AS dropoff_picks,
    entry.then_customer, entry.then_dropoff, entry.then_shown_goods_name, entry.then_wage_vnd::text, entry.then_rate_vnd_per_ton::text, entry.then_allowance_vnd::text, entry.then_note,
    (SELECT count(*) FROM company_knowledge_links link WHERE link.entry_id = entry.id)::int AS linked_documents,
    entry.updated_at
  FROM company_knowledge_entries entry
  LEFT JOIN memberships driver ON driver.workspace_id = entry.workspace_id AND driver.user_id = entry.when_driver_user_id
  LEFT JOIN memberships author ON author.workspace_id = entry.workspace_id AND author.user_id = entry.author_user_id
`;

export type EntryFilter = { where: string; values: unknown[] };

export async function findEntry(transaction: Transaction, workspaceId: string, entryId: string): Promise<StoredEntry | null> {
  const [entry] = await selectEntries(transaction, { where: 'entry.workspace_id = $1 AND entry.id = $2', values: [workspaceId, entryId] });
  return entry ?? null;
}

export async function selectEntries(transaction: Transaction, { where, values }: EntryFilter): Promise<StoredEntry[]> {
  const rows = await transaction.query<EntryRow>(`${SELECT_ENTRIES_SQL} WHERE ${where} ORDER BY entry.created_at, entry.id`, values);
  return rows.map(toStoredEntry);
}

function buildPicksSql(slot: FactCompanySlot): string {
  return `coalesce((SELECT array_agg(pick.organization_id::text) FROM company_knowledge_companies pick WHERE pick.entry_id = entry.id AND pick.slot = '${slot}'), '{}')`;
}

function toStoredEntry(row: EntryRow): StoredEntry {
  return {
    ...toConditions(row),
    id: row.id, statement: row.statement, authorName: row.author_name,
    sides: { pickup: toPickupSide(row), dropoff: toDropoffSide(row) },
    outcomes: toOutcomes(row), linkedDocuments: row.linked_documents, updatedAt: row.updated_at,
  };
}

function toConditions(row: EntryRow): Pick<StoredEntry, 'goods' | 'vehiclePlate' | 'driverUserId' | 'driverName'> {
  return { goods: row.when_goods, vehiclePlate: row.when_vehicle_plate, driverUserId: row.when_driver_user_id, driverName: row.driver_name };
}

function toPickupSide(row: EntryRow): StoredSide {
  return { name: row.when_pickup_name, matchKey: row.when_pickup_match_key, resolved: row.when_pickup_resolved, picks: row.pickup_picks };
}

function toDropoffSide(row: EntryRow): StoredSide {
  return { name: row.when_dropoff_name, matchKey: row.when_dropoff_match_key, resolved: row.when_dropoff_resolved, picks: row.dropoff_picks };
}

function toOutcomes(row: EntryRow): KnowledgeOutcomes {
  return {
    customer: row.then_customer,
    dropoff: row.then_dropoff,
    shownGoodsName: row.then_shown_goods_name,
    wageVnd: toNumber(row.then_wage_vnd),
    ratePerTonVnd: toNumber(row.then_rate_vnd_per_ton),
    allowanceVnd: toNumber(row.then_allowance_vnd),
    note: row.then_note,
  };
}

function toNumber(text: string | null): number | null {
  return text === null ? null : Number(text);
}
