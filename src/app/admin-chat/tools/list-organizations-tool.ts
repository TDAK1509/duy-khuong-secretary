import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { listOrganizations } from '../../documents/list-organizations.ts';
import { decodeOrganizationCursor } from '../../documents/organization-cursor.ts';
import { failInvalidArgument } from './tool-result.ts';

const argumentsSchema = z.object({ text: z.string().nullable(), cursor: z.string().nullable() });

export async function runListOrganizations(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const cursor = args.cursor === null ? null : decodeOrganizationCursor(args.cursor);
  if (args.cursor !== null && cursor === null) return failInvalidArgument('cursor');
  const page = await listOrganizations(database, scope, args.text, cursor);
  return JSON.stringify({ ok: true, organizations: page.organizations, next_cursor: page.nextCursor });
}
