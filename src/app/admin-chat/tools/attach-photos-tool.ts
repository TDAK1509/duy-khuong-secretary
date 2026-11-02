import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import { findRecordPhotos } from '../../records/find-record-photos.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';

const argumentsSchema = z.object({ record_ids: z.array(z.string()) });

export async function runAttachPhotos(dependencies: AdminToolDependencies, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const photos = await findRecordPhotos(dependencies.database, scope, args.record_ids);
  return JSON.stringify({ attached: dependencies.attachments.add(photos) });
}
