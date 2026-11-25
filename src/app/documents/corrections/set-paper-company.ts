import { buildMatchKey } from '../build-match-key.ts';
import { insertRow } from '../insert-row.ts';
import type { CompanyTarget } from './company-target.ts';
import type { CompanyRoles, PaperCorrector } from './paper-correction.ts';

const DELETE_PARTIES_SQL = 'DELETE FROM document_parties WHERE workspace_id = $1 AND document_id = $2 AND role = ANY($3::text[])';

export async function setPaperCompany({ transaction, workspaceId }: PaperCorrector, paperId: string, roles: CompanyRoles, { organization }: CompanyTarget): Promise<void> {
  await transaction.query(DELETE_PARTIES_SQL, [workspaceId, paperId, roles.replaced]);
  await insertRow(transaction, 'document_parties', {
    workspace_id: workspaceId,
    document_id: paperId,
    role: roles.assigned,
    type: organization.type,
    printed_name: organization.name,
    match_key: buildMatchKey(organization.name),
    organization_id: organization.id,
  });
}
