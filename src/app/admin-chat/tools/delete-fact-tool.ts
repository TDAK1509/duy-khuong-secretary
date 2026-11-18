import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { deleteFact, type DeletedFact } from '../../facts/delete-fact.ts';
import { failTool } from './tool-result.ts';

const FACT_NOT_FOUND_ERROR = 'Không tìm thấy thông tin này. Gọi list_facts để lấy đúng id.';

const argumentsSchema = z.strictObject({ fact_id: z.string() });

export async function runDeleteFact(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { fact_id: factId } = argumentsSchema.parse(parsedArguments);
  if (!z.uuid().safeParse(factId).success) return failTool(FACT_NOT_FOUND_ERROR);
  const deleted = await deleteFact(database, scope.workspaceId, factId);
  if (deleted === null) return failTool(FACT_NOT_FOUND_ERROR);
  return JSON.stringify(describeDeletedFact(deleted));
}

function describeDeletedFact(fact: DeletedFact): Record<string, unknown> {
  return {
    ok: true,
    statement: fact.statement,
    scope: { vehicle_plate: fact.vehiclePlate, driver: fact.driverName, pickup_company: fact.pickupName, dropoff_company: fact.dropoffName, customer_company: fact.customerName },
    former_linked_documents: fact.linkedDocuments,
  };
}
