import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { proposeTemplateFromPaper, proposeTemplatesFromPapers, type ProposedField, type TemplateProposal } from '../../document-templates/propose-document-templates.ts';
import { failTool, refuseInvalidArgument } from './tool-result.ts';

const PAPER_NOT_FOUND_ERROR = 'Không tìm thấy giấy tờ này.';

const argumentsSchema = z.strictObject({ paper_id: z.string().nullable() });

export async function runProposeDocumentTemplates(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { paper_id: paperId } = argumentsSchema.parse(parsedArguments);
  if (paperId === null) return JSON.stringify({ proposals: (await proposeTemplatesFromPapers(database, scope.workspaceId)).map(describeProposal) });
  if (!z.uuid().safeParse(paperId).success) refuseInvalidArgument('paper_id');
  const proposal = await proposeTemplateFromPaper(database, scope.workspaceId, paperId);
  return proposal === null ? failTool(PAPER_NOT_FOUND_ERROR) : JSON.stringify({ proposals: [describeProposal(proposal)] });
}

function describeProposal(proposal: TemplateProposal): Record<string, unknown> {
  return {
    issuer_company: proposal.issuerName,
    kind: proposal.kind,
    papers: proposal.paperCount,
    stages: proposal.stageCounts,
    fields: proposal.fields.map(describeField),
  };
}

function describeField({ name, valueType, unit, paperCount }: ProposedField): Record<string, unknown> {
  return { name, type: valueType, unit, papers: paperCount };
}
