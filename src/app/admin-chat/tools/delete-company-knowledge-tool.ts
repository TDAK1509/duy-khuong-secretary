import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { deleteKnowledge } from '../../facts/delete-company-knowledge.ts';
import { describeThen, describeWhen } from './describe-knowledge.ts';
import { failTool } from './tool-result.ts';

const NOT_FOUND_ERROR = 'Không tìm thấy kiến thức này. Gọi list_company_knowledge để lấy đúng entry_id.';

const argumentsSchema = z.strictObject({ entry_id: z.string() });

export async function runDeleteCompanyKnowledge(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { entry_id: entryId } = argumentsSchema.parse(parsedArguments);
  if (!z.uuid().safeParse(entryId).success) return failTool(NOT_FOUND_ERROR);
  const deleted = await deleteKnowledge(database, scope.workspaceId, entryId);
  if (deleted === null) return failTool(NOT_FOUND_ERROR);
  return JSON.stringify({ ok: true, statement: deleted.statement, when: describeWhen(deleted), then: describeThen(deleted.outcomes), former_linked_documents: deleted.linkedDocuments });
}
