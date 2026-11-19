import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import type { FactScope } from '../../facts/fact.ts';
import { pickFactCompanies, type CompanyPicks } from '../../facts/pick-fact-companies.ts';
import { saveFact, type SaveFactResult } from '../../facts/save-fact.ts';
import type { ValueChange } from '../../facts/plan-value-changes.ts';
import type { RouteFact } from '../../facts/route-fact-identity.ts';
import { describeStoredValue } from './describe-stored-value.ts';
import { flattenStatement, MAX_STATEMENT_LENGTH } from '../../facts/keep-newest-statements.ts';
import type { ReaderService } from '../../../services/reading/reader-service.ts';
import { listSlotNames, readCompanyArgument, type ResolvedCompany } from './fact-company-argument.ts';
import { addCustomerValue, describeFactValue, splitSavedFromRefused, valueArgumentSchema } from './fact-value-arguments.ts';
import { findFactDriver, type FactDriver } from './find-fact-driver.ts';
import { failTool, refuseInvalidArgument, ToolRefusal } from './tool-result.ts';
import { readPlateArgument } from './vehicle-plate.ts';


const SCOPE_MISSING_ERROR = 'Cần ít nhất một trong: biển số xe, tài xế, nơi lấy hàng, nơi đổ hàng.';
const NO_VALUE_SAVED_ERROR = 'Không lưu được giá trị nào, nên chưa lưu thông tin này.';
const NOT_SAME_ROUTE_ERROR = 'fact_id không phải thông tin cùng tuyến, cùng xe, cùng tài xế và cùng khách hàng với thông tin này. Chưa lưu gì.';

const argumentsSchema = z.strictObject({
  statement: z.string(),
  vehicle_plate: z.string().nullable(),
  driver_member_id: z.string().nullable(),
  pickup_company: z.string().nullable(),
  dropoff_company: z.string().nullable(),
  customer_company: z.string().nullable(),
  values: z.array(valueArgumentSchema),
  fact_id: z.string().nullable(),
});

type SaveFactArguments = z.infer<typeof argumentsSchema>;

export async function runSaveFact(database: Database, scope: AccessScope, parsedArguments: unknown, companyReader: ReaderService | null = null): Promise<string> {
  const request = argumentsSchema.parse(parsedArguments);
  const statement = readStatement(request.statement);
  const driver = await findFactDriver(database, scope.workspaceId, request.driver_member_id);
  const { saved, refused } = splitSavedFromRefused(request.values);
  if (saved.length === 0) return JSON.stringify({ ok: false, error: NO_VALUE_SAVED_ERROR, refused_values: refused });
  const factScope = await readFactScope(database, scope.workspaceId, request, driver, await pickNamedCompanies(companyReader, database, scope.workspaceId, request));
  const values = addCustomerValue(saved, factScope.customer);
  const result = await saveFact(database, { workspaceId: scope.workspaceId, authorUserId: scope.userId, statement, scope: factScope, values }, { targetFactId: readTargetFactId(request.fact_id), updateValues: saved });
  return describeSaveResult(result, { scope: describeScope(factScope, driver), values: values.map(describeFactValue), refused_values: refused });
}

function readTargetFactId(raw: string | null): string | null {
  if (raw === null) return null;
  if (!z.uuid().safeParse(raw).success) refuseInvalidArgument('fact_id');
  return raw;
}

type SaveSummary = { scope: Record<string, string | null>; values: unknown[]; refused_values: unknown[] };

function describeSaveResult(result: SaveFactResult, summary: SaveSummary): string {
  if (result.action === 'not_same_route') return failTool(NOT_SAME_ROUTE_ERROR);
  if (result.action === 'ambiguous') return JSON.stringify({ ok: true, action: 'ambiguous', candidates: result.candidates.map(describeCandidate), scope: summary.scope });
  if (result.action === 'added') return JSON.stringify({ ok: true, action: 'added', fact_id: result.factId, ...summary, linked_documents: result.linkedDocuments });
  const changes = result.changes.map(describeValueChange);
  const restored = result.restoredSlots.map((slot) => ({ slot, companies: summary.scope[`${slot}_company_matched`] ?? null }));
  return JSON.stringify({ ok: true, action: 'updated', fact_id: result.factId, ...summary, scope: describeStoredScope(result.stored, summary.scope), changes, restored_companies: restored, linked_documents: result.linkedDocuments });
}

function describeStoredScope(stored: RouteFact, requested: Record<string, string | null>): Record<string, string | null> {
  return { vehicle_plate: stored.vehiclePlate, driver: requested['driver'] ?? null, pickup_company: stored.pickupName, dropoff_company: stored.dropoffName, customer_company: stored.customerName };
}

function describeCandidate(fact: RouteFact): Record<string, string | null> {
  return { fact_id: fact.id, vehicle_plate: fact.vehiclePlate, pickup_company: fact.pickupName, dropoff_company: fact.dropoffName, customer_company: fact.customerName, goods: fact.goodsName };
}

function describeValueChange({ name, before, after }: ValueChange): Record<string, unknown> {
  return { kind: before === null ? 'added' : 'replaced', name, before: describeStoredValue(before), after: describeStoredValue(after) };
}

async function pickNamedCompanies(companyReader: ReaderService | null, database: Database, workspaceId: string, request: SaveFactArguments): Promise<CompanyPicks> {
  readPlateArgument(request.vehicle_plate);
  return pickFactCompanies(companyReader, database, workspaceId, listSlotNames(request));
}

function readStatement(raw: string): string {
  const statement = flattenStatement(raw);
  if (statement === '' || statement.length > MAX_STATEMENT_LENGTH) refuseInvalidArgument('statement');
  return statement;
}

type ResolvedScope = FactScope & { pickup: ResolvedCompany | null; dropoff: ResolvedCompany | null; customer: ResolvedCompany | null };

async function readFactScope(database: Database, workspaceId: string, request: SaveFactArguments, driver: FactDriver | null, picks: CompanyPicks): Promise<ResolvedScope> {
  const factScope = {
    vehiclePlate: readPlateArgument(request.vehicle_plate),
    driverUserId: driver?.userId ?? null,
    pickup: await readCompanyArgument(database, workspaceId, request.pickup_company, 'pickup_company', picks.pickup),
    dropoff: await readCompanyArgument(database, workspaceId, request.dropoff_company, 'dropoff_company', picks.dropoff),
    customer: await readCompanyArgument(database, workspaceId, request.customer_company, 'customer_company', picks.customer),
  };
  const isEmpty = [factScope.vehiclePlate, factScope.driverUserId, factScope.pickup, factScope.dropoff].every((part) => part === null);
  if (isEmpty) throw new ToolRefusal(SCOPE_MISSING_ERROR);
  return factScope;
}

function describeScope(factScope: ResolvedScope, driver: FactDriver | null): Record<string, string | null> {
  return {
    vehicle_plate: factScope.vehiclePlate,
    driver: driver?.name ?? null,
    pickup_company: factScope.pickup?.name ?? null,
    pickup_company_matched: factScope.pickup?.matchedOrganization ?? null,
    dropoff_company: factScope.dropoff?.name ?? null,
    dropoff_company_matched: factScope.dropoff?.matchedOrganization ?? null,
    customer_company: factScope.customer?.name ?? null,
    customer_company_matched: factScope.customer?.matchedOrganization ?? null,
  };
}

