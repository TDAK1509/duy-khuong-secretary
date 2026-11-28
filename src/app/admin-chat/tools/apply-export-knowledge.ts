import type { AccessScope } from '../../access/access-scope.ts';
import { runInTransaction, type Database } from '../../db/transaction.ts';
import type { KnowledgeChange, KnowledgeWhen } from '../../export-reviews/build-change-candidates.ts';
import type { ReviewChange } from '../../export-reviews/review-changes.ts';
import type { WriteChecks, WriteStop } from '../../facts/check-knowledge-write.ts';
import { NO_OUTCOMES, type KnowledgeConditions, type KnowledgeCompany, type KnowledgeOutcomes, type StoredEntry, type StoredSide } from '../../facts/company-knowledge.ts';
import { flattenStatement } from '../../facts/keep-newest-statements.ts';
import { OUTCOME_DEFINITIONS } from '../../facts/knowledge-outcomes.ts';
import { saveKnowledge } from '../../facts/save-company-knowledge.ts';
import { findEntry } from '../../facts/select-entries.ts';
import { updateKnowledge } from '../../facts/update-company-knowledge.ts';
import { readCompanyArgument } from './fact-company-argument.ts';
import { RejectedExportChange } from './rejected-export-change.ts';
import { readPlateArgument } from './vehicle-plate.ts';

const MAX_SHOWN_GOODS_NAME_LENGTH = 80;

export type KnowledgeWrite = { kind: 'written' } | { kind: 'stopped'; stop: WriteStop };

export type KnowledgeRequest = { change: ReviewChange; action: KnowledgeChange; checks: WriteChecks };

export function writeKnowledgeChange(database: Database, scope: AccessScope, request: KnowledgeRequest): Promise<KnowledgeWrite> {
  return request.action.entry_id === null ? addEntry(database, scope, request) : updateEntry(database, scope, request);
}

async function updateEntry(database: Database, scope: AccessScope, { change, action, checks }: KnowledgeRequest): Promise<KnowledgeWrite> {
  const stored = await runInTransaction(database, (transaction) => findEntry(transaction, scope.workspaceId, action.entry_id!));
  if (stored === null) throw new RejectedExportChange('entry_missing');
  if (readOutcome(stored.outcomes, action) !== readSavedValue(change)) throw new RejectedExportChange('stale');
  const update = { workspaceId: scope.workspaceId, entryId: stored.id, statement: describeStatement(change), when: describeConditions(stored), then: setOutcome(stored.outcomes, action) };
  const result = await updateKnowledge(database, update, checks);
  if (result.kind === 'stopped') return { kind: 'stopped', stop: result.stop };
  if (result.kind !== 'updated') throw new RejectedExportChange(result.kind);
  return { kind: 'written' };
}

async function addEntry(database: Database, scope: AccessScope, { change, action, checks }: KnowledgeRequest): Promise<KnowledgeWrite> {
  const when = await readConditions(database, scope.workspaceId, action.when);
  const knowledge = { workspaceId: scope.workspaceId, authorUserId: scope.userId, statement: describeStatement(change), when, then: setOutcome(NO_OUTCOMES, action) };
  const result = await saveKnowledge(database, knowledge, { targetEntryId: null, checks });
  if (result.action === 'conflict' || result.action === 'check_notes') return { kind: 'stopped', stop: result };
  if (result.action !== 'added' && result.action !== 'updated') throw new RejectedExportChange(result.action);
  return { kind: 'written' };
}

function readSavedValue({ source, before }: ReviewChange): unknown {
  return source?.kind === 'computed' && source.field === 'then_rate_vnd_per_ton' ? source.snapshot['rate_vnd_per_ton'] : before;
}

function describeStatement({ columnName, after }: ReviewChange): string {
  return flattenStatement(`${columnName} = ${after}`);
}

function readOutcome(outcomes: KnowledgeOutcomes, action: KnowledgeChange): KnowledgeOutcomes[keyof KnowledgeOutcomes] {
  return outcomes[findOutcomeKey(action)];
}

function setOutcome(outcomes: KnowledgeOutcomes, action: KnowledgeChange): KnowledgeOutcomes {
  const isTooLong = action.outcome === 'then_shown_goods_name' && String(action.value).length > MAX_SHOWN_GOODS_NAME_LENGTH;
  if (isTooLong) throw new RejectedExportChange('invalid_value');
  return { ...outcomes, [findOutcomeKey(action)]: action.value };
}

function findOutcomeKey({ outcome }: KnowledgeChange): keyof KnowledgeOutcomes {
  const definition = OUTCOME_DEFINITIONS.find((candidate) => candidate.column === outcome);
  if (definition === undefined) throw new RejectedExportChange('invalid_value');
  return definition.key;
}

function describeConditions(entry: StoredEntry): KnowledgeConditions {
  return { goods: entry.goods, vehiclePlate: entry.vehiclePlate, driverUserId: entry.driverUserId, pickup: describeCompany(entry.sides.pickup), dropoff: describeCompany(entry.sides.dropoff) };
}

function describeCompany({ name, matchKey, resolved, picks }: StoredSide): KnowledgeCompany | null {
  return matchKey === null ? null : { name: name ?? '', matchKey, organizationIds: resolved ? picks : null };
}

async function readConditions(database: Database, workspaceId: string, when: KnowledgeWhen): Promise<KnowledgeConditions> {
  const pickup = await readCompanyArgument(database, workspaceId, when.pickup_company);
  const dropoff = await readCompanyArgument(database, workspaceId, when.dropoff_company);
  return { goods: when.goods, vehiclePlate: readPlateArgument(when.vehicle_plate), driverUserId: null, pickup, dropoff };
}
