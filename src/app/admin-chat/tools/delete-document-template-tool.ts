import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import { deleteDocumentTemplate } from '../../document-templates/delete-document-template.ts';
import { failTool } from './tool-result.ts';

const TEMPLATE_NOT_FOUND_ERROR = 'Không tìm thấy mẫu này. Gọi list_document_templates để lấy đúng tên mẫu.';

const argumentsSchema = z.strictObject({ name: z.string() });

export async function runDeleteDocumentTemplate(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { name } = argumentsSchema.parse(parsedArguments);
  const nameKey = buildMatchKey(name);
  const deleted = nameKey === '' ? null : await deleteDocumentTemplate(database, scope.workspaceId, nameKey);
  if (deleted === null) return failTool(TEMPLATE_NOT_FOUND_ERROR);
  return JSON.stringify({ ok: true, template: deleted.name, kind: deleted.kind, former_papers: deleted.paperCount });
}
