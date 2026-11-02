import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { findLatestMaintenance } from '../../records/find-latest-maintenance.ts';

const argumentsSchema = z.object({
  plate: z.string().nullable(),
  maintenance_item: z.string().nullable(),
  cursor: z.string().nullable(),
});

export async function runMaintenanceStatus(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const items = await findLatestMaintenance(database, scope, { plate: args.plate, maintenanceItem: args.maintenance_item });
  return JSON.stringify({ items, next_cursor: null });
}
