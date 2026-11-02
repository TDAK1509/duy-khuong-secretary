import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import { findLatestMaintenance } from '../../records/find-latest-maintenance.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';

const argumentsSchema = z.object({
  plate: z.string().nullable(),
  maintenance_item: z.string().nullable(),
  cursor: z.string().nullable(),
});

export async function runMaintenanceStatus(dependencies: AdminToolDependencies, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const items = await findLatestMaintenance(
    dependencies.database,
    scope,
    { plate: args.plate, maintenanceItem: args.maintenance_item },
    dependencies.clock.now(),
  );
  return JSON.stringify({ items, next_cursor: null });
}
