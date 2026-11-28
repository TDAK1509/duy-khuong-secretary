import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import { runInTransaction } from '../../db/transaction.ts';
import type { CandidateAction, KnowledgeChange, PaperCorrection } from '../../export-reviews/build-change-candidates.ts';
import { findGroupOf } from '../../export-reviews/group-changes.ts';
import { listReviewChangesOf, markChanges, type ReviewChange } from '../../export-reviews/review-changes.ts';
import { applyPaperCorrection } from './apply-export-paper-correction.ts';
import { writeKnowledgeChange } from './apply-export-knowledge.ts';
import { describeStopFields } from './describe-knowledge.ts';
import { RejectedExportChange } from './rejected-export-change.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';
import { ToolRefusal } from './tool-result.ts';

const decisionSchema = z.strictObject({
  change_id: z.string(),
  cause: z.enum(['paper_reading', 'company_knowledge', 'dismiss']),
  replace_conflicts: z.boolean(),
  notes_checked: z.boolean(),
});

const argumentsSchema = z.strictObject({ decisions: z.array(decisionSchema) });

type Decision = z.infer<typeof decisionSchema>;

export async function runApplyEditedExportChanges(dependencies: AdminToolDependencies, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { decisions } = argumentsSchema.parse(parsedArguments);
  const results: Record<string, unknown>[] = [];
  for (const decision of decisions) results.push({ change_id: decision.change_id, ...(await settleDecision(dependencies, scope, decision)) });
  return JSON.stringify({ ok: true, results });
}

async function settleDecision(dependencies: AdminToolDependencies, scope: AccessScope, decision: Decision): Promise<Record<string, unknown>> {
  try {
    return await decideChange(dependencies, scope, decision);
  } catch (error) {
    if (error instanceof RejectedExportChange) return { ok: false, action: 'rejected', reason: error.reason };
    if (error instanceof ToolRefusal) return { ok: false, action: 'rejected', reason: 'tool_refused', message: error.message };
    throw error;
  }
}

async function decideChange(dependencies: AdminToolDependencies, scope: AccessScope, decision: Decision): Promise<Record<string, unknown>> {
  const pending = await findPendingGroup(dependencies, scope, decision.change_id);
  if (decision.cause === 'dismiss') return dismissChanges(dependencies, scope, pending);
  const action = pending[0]!.candidates.find((candidate) => candidate.cause === decision.cause);
  if (action === undefined) throw new RejectedExportChange('cause_not_offered');
  if (action.cause === 'paper_reading') return applyPapers(dependencies, scope, pending);
  return applyKnowledge(dependencies, scope, { pending, action: action.change, checks: { replaceConflicts: decision.replace_conflicts, notesChecked: decision.notes_checked } });
}

async function findPendingGroup(dependencies: AdminToolDependencies, scope: AccessScope, changeId: string): Promise<ReviewChange[]> {
  if (!z.uuid().safeParse(changeId).success) throw new RejectedExportChange('not_listed');
  const changes = await runInTransaction(dependencies.database, (transaction) => listReviewChangesOf(transaction, scope.workspaceId, changeId));
  const change = changes.find((candidate) => candidate.id === changeId);
  if (change === undefined) throw new RejectedExportChange('not_listed');
  if (change.status !== 'pending') throw new RejectedExportChange(change.status === 'unsupported' ? 'unsupported' : 'already_handled');
  return findGroupOf(changes, change).changes;
}

async function dismissChanges(dependencies: AdminToolDependencies, scope: AccessScope, pending: ReviewChange[]): Promise<Record<string, unknown>> {
  await runInTransaction(dependencies.database, (transaction) => markChanges(transaction, scope.workspaceId, pending.map((change) => change.id), 'dismissed'));
  return { ok: true, action: 'dismissed' };
}

async function applyPapers(dependencies: AdminToolDependencies, scope: AccessScope, pending: ReviewChange[]): Promise<Record<string, unknown>> {
  for (const change of pending) await applyPaperCorrection(dependencies, scope, change, readPaperCorrection(change));
  return { ok: true, action: 'applied', cause: 'paper_reading' };
}

function readPaperCorrection(change: ReviewChange): PaperCorrection {
  const action = change.candidates.find((candidate): candidate is Extract<CandidateAction, { cause: 'paper_reading' }> => candidate.cause === 'paper_reading');
  if (action === undefined) throw new RejectedExportChange('cause_not_offered');
  return action.change;
}

type KnowledgeDecision = { pending: ReviewChange[]; action: KnowledgeChange; checks: { replaceConflicts: boolean; notesChecked: boolean } };

async function applyKnowledge(dependencies: AdminToolDependencies, scope: AccessScope, { pending, action, checks }: KnowledgeDecision): Promise<Record<string, unknown>> {
  const written = await writeKnowledgeChange(dependencies.database, scope, { change: pending[0]!, action, checks });
  if (written.kind === 'stopped') return describeStopFields(written.stop);
  await runInTransaction(dependencies.database, (transaction) => markChanges(transaction, scope.workspaceId, pending.map((change) => change.id), 'applied'));
  return { ok: true, action: 'applied', cause: 'company_knowledge' };
}
