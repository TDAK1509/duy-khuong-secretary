import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { saveKnowledge, type SaveKnowledgeResult } from '../../facts/save-company-knowledge.ts';
import type { ReaderService } from '../../../services/reading/reader-service.ts';
import { knowledgeFieldsSchema, readKnowledgeArguments, type ReadKnowledge } from './company-knowledge-arguments.ts';
import { describeCandidate, describeChange, describeThen, describeWhenWithMatches } from './describe-knowledge.ts';
import { failTool, refuseInvalidArgument } from './tool-result.ts';

const NOT_SAME_CONDITIONS_ERROR = 'entry_id không phải mục có cùng mọi điều kiện when với kiến thức này. Chưa lưu gì.';

const argumentsSchema = z.strictObject({ ...knowledgeFieldsSchema, entry_id: z.string().nullable() });

export async function runSaveCompanyKnowledge(database: Database, scope: AccessScope, parsedArguments: unknown, companyReader: ReaderService | null = null): Promise<string> {
  const request = argumentsSchema.parse(parsedArguments);
  const targetEntryId = readTargetEntryId(request.entry_id);
  const read = await readKnowledgeArguments(database, scope, request, companyReader);
  const result = await saveKnowledge(database, read.knowledge, targetEntryId);
  return describeSaveResult(result, read);
}

function readTargetEntryId(raw: string | null): string | null {
  if (raw === null) return null;
  if (!z.uuid().safeParse(raw).success) refuseInvalidArgument('entry_id');
  return raw;
}

function describeSaveResult(result: SaveKnowledgeResult, read: ReadKnowledge): string {
  if (result.action === 'not_same_conditions') return failTool(NOT_SAME_CONDITIONS_ERROR);
  if (result.action === 'ambiguous') return JSON.stringify({ ok: true, action: 'ambiguous', candidates: result.candidates.map(describeCandidate) });
  const matched = { pickup: read.pickup?.matchedOrganization ?? null, dropoff: read.dropoff?.matchedOrganization ?? null };
  const changes = result.action === 'updated' ? result.changes.map(describeChange) : [];
  const { entry } = result;
  return JSON.stringify({ ok: true, action: result.action, entry_id: entry.id, when: describeWhenWithMatches(entry, matched), then: describeThen(entry.outcomes), changes, linked_documents: entry.linkedDocuments });
}
