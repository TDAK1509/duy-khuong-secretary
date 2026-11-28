import type { Database } from '../db/transaction.ts';
import { buildCompanyMatch } from '../facts/link-facts.ts';
import { ROUTE_DROPOFF_KEY_SQL, ROUTE_DROPOFF_NAME_SQL } from './route-dropoff.ts';

export type PickupEntry = {
  document_id: string;
  entry_id: string;
  pickup_name: string | null;
  pickup_match_key: string | null;
  dropoff_name: string | null;
  dropoff_match_key: string | null;
  customer_name: string | null;
};

export type UnprintedPickupEntry = { pickup_id: string; entry_id: string };

export async function listPickupEntries(database: Database, workspaceId: string, pickupIds: string[]): Promise<PickupEntry[]> {
  if (pickupIds.length === 0) return [];
  const { rows } = await database.query<PickupEntry>(
    `SELECT link.document_id, entry.id AS entry_id, entry.when_pickup_name AS pickup_name, entry.when_pickup_match_key AS pickup_match_key,
       ${ROUTE_DROPOFF_NAME_SQL} AS dropoff_name, ${ROUTE_DROPOFF_KEY_SQL} AS dropoff_match_key, entry.then_customer AS customer_name
     FROM company_knowledge_links link JOIN company_knowledge_entries entry ON entry.id = link.entry_id AND entry.workspace_id = link.workspace_id
     WHERE link.workspace_id = $1 AND link.document_id = ANY($2::uuid[])
     ORDER BY entry.updated_at DESC, entry.id DESC`,
    [workspaceId, pickupIds],
  );
  return rows;
}

export async function listUnprintedPickupEntries(database: Database, workspaceId: string, trips: { pickupId: string; dropOffId: string | null }[]): Promise<UnprintedPickupEntry[]> {
  if (trips.length === 0) return [];
  const { rows } = await database.query<UnprintedPickupEntry>(
    `SELECT DISTINCT trip.pickup_id::text AS pickup_id, entry.id::text AS entry_id
     FROM unnest($2::uuid[], $3::uuid[]) AS trip(pickup_id, dropoff_id)
     JOIN documents document ON document.id = trip.pickup_id AND document.workspace_id = $1
     JOIN company_knowledge_links link ON link.workspace_id = $1 AND link.document_id IN (trip.pickup_id, trip.dropoff_id)
     JOIN company_knowledge_entries entry ON entry.id = link.entry_id AND entry.workspace_id = link.workspace_id
     WHERE entry.when_pickup_match_key IS NOT NULL AND NOT ${buildCompanyMatch('pickup')}`,
    [workspaceId, trips.map((trip) => trip.pickupId), trips.map((trip) => trip.dropOffId)],
  );
  return rows;
}
