import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { updateKnowledge, type UpdateKnowledgeResult } from '../../facts/update-company-knowledge.ts';
import type { ReaderService } from '../../../services/reading/reader-service.ts';
import { knowledgeFieldsSchema, readKnowledgeArguments } from './company-knowledge-arguments.ts';
import { describeChange, describeThen, describeWhenWithMatches } from './describe-knowledge.ts';
import { failTool } from './tool-result.ts';

const NOT_FOUND_ERROR = 'Không tìm thấy kiến thức này. Gọi list_company_knowledge để lấy đúng entry_id.';
const SAME_AS_OTHER_ERROR = 'Sau khi đổi, kiến thức này sẽ trùng mọi điều kiện when với một mục đã lưu khác. Chưa đổi gì.';

const argumentsSchema = z.strictObject({ entry_id: z.string(), ...knowledgeFieldsSchema });

export async function runUpdateCompanyKnowledge(database: Database, scope: AccessScope, parsedArguments: unknown, companyReader: ReaderService | null = null): Promise<string> {
  const request = argumentsSchema.parse(parsedArguments);
  if (!z.uuid().safeParse(request.entry_id).success) return failTool(NOT_FOUND_ERROR);
  const read = await readKnowledgeArguments(database, scope, request, companyReader);
  const result = await updateKnowledge(database, { ...read.knowledge, entryId: request.entry_id });
  const matched = { pickup: read.pickup?.matchedOrganization ?? null, dropoff: read.dropoff?.matchedOrganization ?? null };
  return describeUpdateResult(result, matched);
}

function describeUpdateResult(result: UpdateKnowledgeResult, matched: { pickup: string | null; dropoff: string | null }): string {
  if (result.kind === 'not_found') return failTool(NOT_FOUND_ERROR);
  if (result.kind === 'same_as_other') return JSON.stringify({ ok: false, error: SAME_AS_OTHER_ERROR, other_entry_id: result.otherEntryId });
  const { entry, changes } = result;
  return JSON.stringify({ ok: true, entry_id: entry.id, when: describeWhenWithMatches(entry, matched), then: describeThen(entry.outcomes), changes: changes.map(describeChange), linked_documents: entry.linkedDocuments });
}
