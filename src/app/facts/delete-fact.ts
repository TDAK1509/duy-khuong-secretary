import { runInTransaction, type Database } from '../db/transaction.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';

export type DeletedFact = {
  statement: string;
  vehiclePlate: string | null;
  driverName: string | null;
  pickupName: string | null;
  dropoffName: string | null;
  linkedDocuments: number;
};

type DeletedRow = {
  statement: string;
  vehicle_plate: string | null;
  driver_name: string | null;
  pickup_name: string | null;
  dropoff_name: string | null;
  linked_documents: number;
};

const DESCRIBE_FACT_SQL = `
  SELECT fact.statement, fact.vehicle_plate, driver.display_name AS driver_name, fact.pickup_name, fact.dropoff_name,
    (SELECT count(*) FROM document_facts link WHERE link.fact_id = fact.id)::int AS linked_documents
  FROM facts fact
  LEFT JOIN memberships driver ON driver.workspace_id = fact.workspace_id AND driver.user_id = fact.driver_user_id
  WHERE fact.id = $1 AND fact.workspace_id = $2
`;

export function deleteFact(database: Database, workspaceId: string, factId: string): Promise<DeletedFact | null> {
  return runInTransaction(database, async (transaction) => {
    await lockWorkspaceRecords(transaction, workspaceId);
    const [row] = await transaction.query<DeletedRow>(DESCRIBE_FACT_SQL, [factId, workspaceId]);
    if (row === undefined) return null;
    await transaction.query('DELETE FROM facts WHERE id = $1 AND workspace_id = $2', [factId, workspaceId]);
    return toDeletedFact(row);
  });
}

function toDeletedFact(row: DeletedRow): DeletedFact {
  return {
    statement: row.statement,
    vehiclePlate: row.vehicle_plate,
    driverName: row.driver_name,
    pickupName: row.pickup_name,
    dropoffName: row.dropoff_name,
    linkedDocuments: row.linked_documents,
  };
}
