import type { Database } from '../db/transaction.ts';

export type FactFilter = { vehiclePlate: string | null; driverUserId: string | null; companyMatchKey: string | null };

export type ListedFactValue = { name: string; number: string | null; unit: string | null; text: string | null };

export type ListedFact = {
  id: string;
  statement: string;
  vehiclePlate: string | null;
  driverName: string | null;
  pickupName: string | null;
  dropoffName: string | null;
  values: ListedFactValue[];
  linkedDocuments: number;
  updatedAt: Date;
};

const LIST_FACTS_SQL = `
  SELECT
    fact.id,
    fact.statement,
    fact.vehicle_plate,
    driver.display_name AS driver_name,
    fact.pickup_name,
    fact.dropoff_name,
    fact.updated_at,
    (SELECT count(*) FROM document_facts link WHERE link.fact_id = fact.id)::int AS linked_documents,
    COALESCE(
      (SELECT json_agg(json_build_object('name', value.name, 'number', value.number::text, 'unit', value.unit, 'text', value.text_value) ORDER BY value.position)
       FROM fact_values value WHERE value.fact_id = fact.id),
      '[]'
    ) AS "values"
  FROM facts fact
  LEFT JOIN memberships driver ON driver.workspace_id = fact.workspace_id AND driver.user_id = fact.driver_user_id
  WHERE fact.workspace_id = $1
    AND ($2::text IS NULL OR fact.vehicle_plate = $2)
    AND ($3::uuid IS NULL OR fact.driver_user_id = $3)
    AND ($4::text IS NULL OR strpos(fact.pickup_match_key, $4) > 0 OR strpos(fact.dropoff_match_key, $4) > 0)
  ORDER BY fact.updated_at DESC, fact.id
`;

type FactRow = {
  id: string;
  statement: string;
  vehicle_plate: string | null;
  driver_name: string | null;
  pickup_name: string | null;
  dropoff_name: string | null;
  updated_at: Date;
  linked_documents: number;
  values: ListedFactValue[];
};

export async function listFacts(database: Database, workspaceId: string, filter: FactFilter): Promise<ListedFact[]> {
  const { rows } = await database.query<FactRow>(LIST_FACTS_SQL, [workspaceId, filter.vehiclePlate, filter.driverUserId, filter.companyMatchKey]);
  return rows.map(toListedFact);
}

function toListedFact(row: FactRow): ListedFact {
  return {
    id: row.id,
    statement: row.statement,
    vehiclePlate: row.vehicle_plate,
    driverName: row.driver_name,
    pickupName: row.pickup_name,
    dropoffName: row.dropoff_name,
    values: row.values,
    linkedDocuments: row.linked_documents,
    updatedAt: row.updated_at,
  };
}
