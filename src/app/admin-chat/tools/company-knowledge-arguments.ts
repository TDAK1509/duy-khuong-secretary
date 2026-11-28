import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import type { KnowledgeConditions, KnowledgeOutcomes, NewKnowledge } from '../../facts/company-knowledge.ts';
import { flattenStatement, MAX_STATEMENT_LENGTH } from '../../facts/keep-newest-statements.ts';
import { pickFactCompanies } from '../../facts/pick-fact-companies.ts';
import type { ReaderService } from '../../../services/reading/reader-service.ts';
import { listSlotNames, readCompanyArgument, type ResolvedCompany } from './fact-company-argument.ts';
import { findFactDriver, type FactDriver } from './find-fact-driver.ts';
import { ToolRefusal, refuseInvalidArgument } from './tool-result.ts';
import { readPlateArgument } from './vehicle-plate.ts';

const NO_CONDITION_ERROR = 'Cần ít nhất một điều kiện when.';
const MAX_SHOWN_GOODS_NAME_LENGTH = 80;
const NO_OUTCOME_ERROR = 'Cần ít nhất một kết quả then.';

export const knowledgeFieldsSchema = {
  statement: z.string(),
  when_goods: z.string().nullable(),
  when_pickup_company: z.string().nullable(),
  when_dropoff_company: z.string().nullable(),
  when_vehicle_plate: z.string().nullable(),
  when_driver_member_id: z.string().nullable(),
  then_customer: z.string().nullable(),
  then_dropoff: z.string().nullable(),
  then_shown_goods: z.string().nullable(),
  then_wage_vnd: z.number().nullable(),
  then_rate_vnd_per_ton: z.number().nullable(),
  then_allowance_vnd: z.number().nullable(),
  then_equal_weights: z.boolean(),
  then_note: z.string().nullable(),
};

export type KnowledgeArguments = z.infer<z.ZodObject<typeof knowledgeFieldsSchema>>;

export type ReadKnowledge = { knowledge: NewKnowledge; driver: FactDriver | null; pickup: ResolvedCompany | null; dropoff: ResolvedCompany | null };

export async function readKnowledgeArguments(database: Database, scope: AccessScope, request: KnowledgeArguments, companyReader: ReaderService | null): Promise<ReadKnowledge> {
  const statement = readStatement(request.statement);
  const driver = await findFactDriver(database, scope.workspaceId, request.when_driver_member_id);
  const plate = readPlateArgument(request.when_vehicle_plate);
  const picks = await pickFactCompanies(companyReader, database, scope.workspaceId, listSlotNames(request));
  const pickup = await readCompanyArgument(database, scope.workspaceId, request.when_pickup_company, picks.pickup);
  const dropoff = await readCompanyArgument(database, scope.workspaceId, request.when_dropoff_company, picks.dropoff);
  const when = { goods: readText(request.when_goods), vehiclePlate: plate, driverUserId: driver?.userId ?? null, pickup, dropoff };
  const then = readOutcomes(request);
  const knowledge = { workspaceId: scope.workspaceId, authorUserId: scope.userId, statement, when: requireCondition(when), then: requireOutcome(then) };
  return { knowledge, driver, pickup, dropoff };
}

function readStatement(raw: string): string {
  const statement = flattenStatement(raw);
  if (statement === '' || statement.length > MAX_STATEMENT_LENGTH) refuseInvalidArgument('statement');
  return statement;
}

function readText(raw: string | null): string | null {
  const text = raw?.trim() ?? '';
  return text === '' ? null : text;
}

function requireCondition(when: KnowledgeConditions): KnowledgeConditions {
  const parts = [when.goods, when.vehiclePlate, when.driverUserId, when.pickup, when.dropoff];
  if (parts.every((part) => part === null)) throw new ToolRefusal(NO_CONDITION_ERROR);
  return when;
}

function readOutcomes(request: KnowledgeArguments): KnowledgeOutcomes {
  return {
    customer: readText(request.then_customer),
    dropoff: readText(request.then_dropoff),
    shownGoodsName: readShownGoodsName(request.then_shown_goods),
    wageVnd: readAmount(request.then_wage_vnd, 'then_wage_vnd'),
    ratePerTonVnd: readAmount(request.then_rate_vnd_per_ton, 'then_rate_vnd_per_ton'),
    allowanceVnd: readAmount(request.then_allowance_vnd, 'then_allowance_vnd'),
    equalWeights: request.then_equal_weights,
    note: readText(request.then_note),
  };
}

function readShownGoodsName(raw: string | null): string | null {
  const name = readText(raw);
  if (name !== null && name.length > MAX_SHOWN_GOODS_NAME_LENGTH) refuseInvalidArgument('then_shown_goods');
  return name;
}

function readAmount(raw: number | null, field: string): number | null {
  if (raw === null) return null;
  if (!Number.isFinite(raw) || raw < 0) refuseInvalidArgument(field);
  return raw;
}

function requireOutcome(then: KnowledgeOutcomes): KnowledgeOutcomes {
  if (Object.values(then).every((value) => value === null || value === false)) throw new ToolRefusal(NO_OUTCOME_ERROR);
  return then;
}
