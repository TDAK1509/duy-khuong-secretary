import type { Transaction } from '../db/transaction.ts';
import { findBackfillCandidates, type CandidateRule } from './find-backfill-candidates.ts';

export type BackfillRequest = { workspaceId: string; templateId: string; revision: number; requestedByUserId: string; rule: CandidateRule };

export type QueuedBackfill = { isStarted: boolean; paperCount: number; isCapped: boolean };

export const NO_BACKFILL: QueuedBackfill = { isStarted: false, paperCount: 0, isCapped: false };

const SUPERSEDE_RUNS_SQL = `
  UPDATE template_backfills
  SET status = 'superseded', claim_token = NULL, locked_until = NULL, finished_at = now()
  WHERE workspace_id = $1 AND template_id = $2 AND status = 'pending'`;

const CARRY_RUNS_SQL = `
  UPDATE template_backfills SET template_revision = $3
  WHERE workspace_id = $1 AND template_id = $2 AND status = 'pending'`;

const INSERT_RUN_SQL = `
  INSERT INTO template_backfills (workspace_id, template_id, template_revision, requested_by_user_id, document_ids)
  VALUES ($1, $2, $3, $4, $5::uuid[])`;

export async function queueTemplateBackfill(transaction: Transaction, request: BackfillRequest): Promise<QueuedBackfill> {
  await transaction.query(SUPERSEDE_RUNS_SQL, [request.workspaceId, request.templateId]);
  const { documentIds, isCapped } = await findBackfillCandidates(transaction, request.workspaceId, request.rule);
  if (documentIds.length === 0) return NO_BACKFILL;
  await transaction.query(INSERT_RUN_SQL, [request.workspaceId, request.templateId, request.revision, request.requestedByUserId, documentIds]);
  return { isStarted: true, paperCount: documentIds.length, isCapped };
}

export async function carryBackfillToRevision(transaction: Transaction, workspaceId: string, templateId: string, revision: number): Promise<void> {
  await transaction.query(CARRY_RUNS_SQL, [workspaceId, templateId, revision]);
}
