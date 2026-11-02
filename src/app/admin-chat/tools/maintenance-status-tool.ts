import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import { decodeMaintenanceCursor } from '../../records/maintenance-cursor.ts';
import { findLatestMaintenance } from '../../records/find-latest-maintenance.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';

const argumentsSchema = z.object({
  plate: z.string().nullable(),
  maintenance_item: z.string().nullable(),
  cursor: z.string().nullable(),
});

export async function runMaintenanceStatus(dependencies: AdminToolDependencies, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const cursor = args.cursor === null ? null : decodeMaintenanceCursor(args.cursor);
  const page = await findLatestMaintenance(
    dependencies.database,
    scope,
    { plate: args.plate, maintenanceItem: args.maintenance_item, cursor },
    dependencies.clock.now(),
  );
  return JSON.stringify({ items: page.items, next_cursor: page.nextCursor });
}
