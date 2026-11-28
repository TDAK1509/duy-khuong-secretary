import type { Database } from '../db/transaction.ts';
import { SELECT_FACT_CUSTOMER_SQL } from '../facts/fact.ts';
import { buildCompanyMatch } from '../facts/link-facts.ts';

export type PickupFact = {
  document_id: string;
  fact_id: string;
  pickup_name: string | null;
  pickup_match_key: string | null;
  dropoff_name: string | null;
  dropoff_match_key: string | null;
  customer_name: string | null;
};

export type UnprintedPickupFact = { pickup_id: string; fact_id: string };

export async function listPickupFacts(database: Database, workspaceId: string, pickupIds: string[]): Promise<PickupFact[]> {
  if (pickupIds.length === 0) return [];
  const { rows } = await database.query<PickupFact>(
    `SELECT link.document_id, fact.id AS fact_id, fact.pickup_name, fact.pickup_match_key, fact.dropoff_name, fact.dropoff_match_key, ${SELECT_FACT_CUSTOMER_SQL} AS customer_name
     FROM document_facts link JOIN facts fact ON fact.id = link.fact_id AND fact.workspace_id = link.workspace_id
     WHERE link.workspace_id = $1 AND link.document_id = ANY($2::uuid[])
     ORDER BY fact.updated_at DESC, fact.id`,
    [workspaceId, pickupIds],
  );
  return rows;
}

export async function listUnprintedPickupFacts(database: Database, workspaceId: string, trips: { pickupId: string; dropOffId: string | null }[]): Promise<UnprintedPickupFact[]> {
  if (trips.length === 0) return [];
  const { rows } = await database.query<UnprintedPickupFact>(
    `SELECT DISTINCT trip.pickup_id::text AS pickup_id, fact.id::text AS fact_id
     FROM unnest($2::uuid[], $3::uuid[]) AS trip(pickup_id, dropoff_id)
     JOIN documents document ON document.id = trip.pickup_id AND document.workspace_id = $1
     JOIN document_facts link ON link.workspace_id = $1 AND link.document_id IN (trip.pickup_id, trip.dropoff_id)
     JOIN facts fact ON fact.id = link.fact_id AND fact.workspace_id = link.workspace_id
     WHERE fact.pickup_match_key IS NOT NULL AND NOT ${buildCompanyMatch('pickup')}`,
    [workspaceId, trips.map((trip) => trip.pickupId), trips.map((trip) => trip.dropOffId)],
  );
  return rows;
}
