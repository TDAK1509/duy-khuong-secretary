import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import { runInTransaction, type Database } from '../../db/transaction.ts';
import { proposeTemplateFromPaper, proposeTemplatesFromPapers, type ProposedField, type TemplateProposal } from '../../documents/templates/propose-document-templates.ts';
import { estimateCredits, findCreditRangePerPaper, type CreditRange } from '../../documents/templates/backfills/estimate-backfill-credits.ts';
import { findBackfillCandidates } from '../../documents/templates/backfills/find-backfill-candidates.ts';
import { failTool, refuseInvalidArgument } from './tool-result.ts';

const PAPER_NOT_FOUND_ERROR = 'Không tìm thấy giấy tờ này.';

const argumentsSchema = z.strictObject({ paper_id: z.string().nullable() });

export async function runProposeDocumentTemplates(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { paper_id: paperId } = argumentsSchema.parse(parsedArguments);
  if (paperId === null) return JSON.stringify({ proposals: await describeProposals(database, scope.workspaceId, await proposeTemplatesFromPapers(database, scope.workspaceId)) });
  if (!z.uuid().safeParse(paperId).success) refuseInvalidArgument('paper_id');
  const proposal = await proposeTemplateFromPaper(database, scope.workspaceId, paperId);
  return proposal === null ? failTool(PAPER_NOT_FOUND_ERROR) : JSON.stringify({ proposals: await describeProposals(database, scope.workspaceId, [proposal]) });
}

async function describeProposals(database: Database, workspaceId: string, proposals: TemplateProposal[]): Promise<Record<string, unknown>[]> {
  return runInTransaction(database, async (transaction) => {
    const creditsPerPaper = await findCreditRangePerPaper(transaction, workspaceId);
    const described: Record<string, unknown>[] = [];
    for (const proposal of proposals) {
      const rule = { templateId: null, issuerOrganizationId: proposal.issuerId, kind: proposal.kind };
      const { documentIds } = await findBackfillCandidates(transaction, workspaceId, rule);
      described.push(describeProposal(proposal, documentIds.length, estimateCredits(creditsPerPaper, documentIds.length)));
    }
    return described;
  });
}

function describeProposal(proposal: TemplateProposal, papersToReread: number, credits: CreditRange | null): Record<string, unknown> {
  return {
    issuer_company: proposal.issuerName,
    kind: proposal.kind,
    papers: proposal.paperCount,
    stages: proposal.stageCounts,
    fields: proposal.fields.map(describeField),
    example_paper_ids: proposal.examplePaperIds,
    papers_to_reread: papersToReread,
    credits_estimate: credits,
  };
}

function describeField({ name, valueType, unit, paperCount }: ProposedField): Record<string, unknown> {
  return { name, type: valueType, unit, papers: paperCount };
}
