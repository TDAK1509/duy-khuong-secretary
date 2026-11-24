import type { Database } from '../db/transaction.ts';

export type PickupFact = {
  document_id: string;
  fact_id: string;
  pickup_name: string | null;
  pickup_match_key: string | null;
  dropoff_name: string | null;
  dropoff_match_key: string | null;
  customer_name: string | null;
};

export async function listPickupFacts(database: Database, workspaceId: string, pickupIds: string[]): Promise<PickupFact[]> {
  if (pickupIds.length === 0) return [];
  const { rows } = await database.query<PickupFact>(
    `SELECT link.document_id, fact.id AS fact_id, fact.pickup_name, fact.pickup_match_key, fact.dropoff_name, fact.dropoff_match_key, fact.customer_name
     FROM document_facts link JOIN facts fact ON fact.id = link.fact_id AND fact.workspace_id = link.workspace_id
     WHERE link.workspace_id = $1 AND link.document_id = ANY($2::uuid[])
     ORDER BY fact.updated_at DESC, fact.id`,
    [workspaceId, pickupIds],
  );
  return rows;
}
