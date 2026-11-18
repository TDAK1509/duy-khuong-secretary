import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import type { StoredValue, ValueChange } from '../../facts/plan-value-changes.ts';
import { hasFact, updateFact, type FactUpdate, type FactUpdateResult, type ScopeChange } from '../../facts/update-fact.ts';
import { listSlotNames, readCompanyArgument, type ResolvedCompany } from './fact-company-argument.ts';
import { pickFactCompanies, type CompanyPicks } from '../../facts/pick-fact-companies.ts';
import type { ReaderService } from '../../../services/reading/reader-service.ts';
import { addCustomerValue, splitSavedFromRefused, valueArgumentSchema, type RefusedValue } from './fact-value-arguments.ts';
import { findFactDriver } from './find-fact-driver.ts';
import { failTool, refuseInvalidArgument, ToolRefusal } from './tool-result.ts';
import { readPlateArgument } from './vehicle-plate.ts';

const SCOPE_FIELDS = ['vehicle_plate', 'driver', 'pickup_company', 'dropoff_company', 'customer_company'] as const;

const FACT_NOT_FOUND_ERROR = 'Không tìm thấy thông tin này. Gọi list_facts để lấy đúng id.';
const NOTHING_TO_CHANGE_ERROR = 'Không có thay đổi nào để lưu.';
const SET_AND_CLEAR_ERROR = 'Một phần phạm vi không thể vừa đổi vừa bỏ.';
const SET_AND_REMOVE_ERROR = 'Một giá trị không thể vừa đặt vừa xóa trong cùng một lần sửa.';
const UPDATE_REFUSALS: Record<Exclude<FactUpdateResult['kind'], 'updated'>, string> = {
  not_found: FACT_NOT_FOUND_ERROR,
  no_values_left: 'Không thể xóa hết giá trị. Muốn bỏ cả thông tin này thì xóa thông tin.',
  no_scope_left: 'Phạm vi cần ít nhất một trong: biển số xe, tài xế, nơi lấy hàng, nơi đổ hàng.',
  statement_too_long: 'Nguyên văn của thông tin này đã quá 2000 ký tự, chưa lưu được thay đổi.',
};

const argumentsSchema = z.strictObject({
  fact_id: z.string(),
  change_statement: z.string(),
  set_values: z.array(valueArgumentSchema),
  remove_values: z.array(z.string()),
  vehicle_plate: z.string().nullable(),
  driver_member_id: z.string().nullable(),
  pickup_company: z.string().nullable(),
  dropoff_company: z.string().nullable(),
  customer_company: z.string().nullable(),
  clear_scope: z.array(z.enum(SCOPE_FIELDS)),
});

type UpdateFactArguments = z.infer<typeof argumentsSchema>;
type ResolvedChange = { scopeChange: ScopeChange; pickup: ResolvedCompany | null; dropoff: ResolvedCompany | null; customer: ResolvedCompany | null };

export async function runUpdateFact(database: Database, scope: AccessScope, parsedArguments: unknown, companyReader: ReaderService | null = null): Promise<string> {
  const request = argumentsSchema.parse(parsedArguments);
  if (!z.uuid().safeParse(request.fact_id).success) return failTool(FACT_NOT_FOUND_ERROR);
  if (!(await hasFact(database, scope.workspaceId, request.fact_id))) return failTool(FACT_NOT_FOUND_ERROR);
  const parsed = await readFactUpdate(database, scope.workspaceId, request, companyReader);
  if (parsed.isEmpty) return JSON.stringify({ ok: false, error: NOTHING_TO_CHANGE_ERROR, refused_values: parsed.refused });
  const result = await updateFact(database, parsed.update);
  if (result.kind !== 'updated') return failTool(UPDATE_REFUSALS[result.kind]);
  return JSON.stringify(describeUpdate(result, parsed));
}

type ParsedUpdate = { update: FactUpdate; resolved: ResolvedChange; refused: RefusedValue[]; removeNames: Map<string, string>; isEmpty: boolean };

async function readFactUpdate(database: Database, workspaceId: string, request: UpdateFactArguments, companyReader: ReaderService | null): Promise<ParsedUpdate> {
  const picks = await pickFactCompanies(companyReader, database, workspaceId, listSlotNames(request));
  const resolved = await readScopeChange(database, workspaceId, request, picks);
  const { saved: setValues, refused } = splitSavedFromRefused(request.set_values);
  const saved = addCustomerValue(setValues, resolved.customer);
  const removeNames = new Map(request.remove_values.map((name) => [readValueKey(name), name.trim()]));
  const removeValueKeys = [...removeNames.keys()];
  if (saved.some((value) => removeNames.has(value.matchKey))) throw new ToolRefusal(SET_AND_REMOVE_ERROR);
  const changeStatement = readChangeStatement(request.change_statement);
  const update = { workspaceId, factId: request.fact_id, changeStatement, setValues: saved, removeValueKeys, scopeChange: resolved.scopeChange };
  const isEmpty = saved.length === 0 && removeValueKeys.length === 0 && Object.keys(resolved.scopeChange).length === 0;
  return { update, resolved, refused, removeNames, isEmpty };
}

async function readScopeChange(database: Database, workspaceId: string, request: UpdateFactArguments, picks: CompanyPicks): Promise<ResolvedChange> {
  const clears = new Set(request.clear_scope);
  const driver = await findFactDriver(database, workspaceId, request.driver_member_id);
  const pickup = await readCompanyArgument(database, workspaceId, request.pickup_company, 'pickup_company', picks.pickup);
  const dropoff = await readCompanyArgument(database, workspaceId, request.dropoff_company, 'dropoff_company', picks.dropoff);
  const customer = await readCompanyArgument(database, workspaceId, request.customer_company, 'customer_company', picks.customer);
  const scopeChange = {
    ...pickScopeField(readPlateArgument(request.vehicle_plate), clears.has('vehicle_plate'), 'vehiclePlate'),
    ...pickScopeField(driver?.userId ?? null, clears.has('driver'), 'driverUserId'),
    ...pickScopeField(pickup, clears.has('pickup_company'), 'pickup'),
    ...pickScopeField(dropoff, clears.has('dropoff_company'), 'dropoff'),
    ...pickScopeField(customer, clears.has('customer_company'), 'customer'),
  };
  return { scopeChange, pickup, dropoff, customer };
}

function pickScopeField<Value>(value: Value | null, isCleared: boolean, field: keyof ScopeChange): ScopeChange {
  if (value !== null && isCleared) throw new ToolRefusal(SET_AND_CLEAR_ERROR);
  if (isCleared) return { [field]: null };
  return value === null ? {} : { [field]: value };
}

function readValueKey(name: string): string {
  const matchKey = buildMatchKey(name);
  if (matchKey === '') refuseInvalidArgument('remove_values');
  return matchKey;
}

function readChangeStatement(raw: string): string {
  const statement = raw.trim();
  if (statement === '') refuseInvalidArgument('change_statement');
  return statement;
}

function describeUpdate(result: Extract<FactUpdateResult, { kind: 'updated' }>, { resolved, refused, removeNames }: ParsedUpdate): Record<string, unknown> {
  return {
    ok: true,
    changed_values: result.changes.map(describeChange),
    values_not_found: result.missingValueKeys.map((key) => removeNames.get(key) ?? key),
    refused_values: refused,
    scope: {
      vehicle_plate: result.scope.vehiclePlate,
      driver: result.scope.driverName,
      pickup_company: result.scope.pickupName,
      dropoff_company: result.scope.dropoffName,
      customer_company: result.scope.customerName,
      ...(resolved.pickup ? { pickup_company_matched: resolved.pickup.matchedOrganization } : {}),
      ...(resolved.dropoff ? { dropoff_company_matched: resolved.dropoff.matchedOrganization } : {}),
      ...(resolved.customer ? { customer_company_matched: resolved.customer.matchedOrganization } : {}),
    },
    linked_documents: result.linkedDocuments,
  };
}

function describeChange({ name, before, after }: ValueChange): Record<string, unknown> {
  return { name, before: describeStoredValue(before), after: describeStoredValue(after) };
}

function describeStoredValue(value: StoredValue | null): Record<string, string> | null {
  if (value === null) return null;
  if (value.number !== null && value.unit !== null) return { number: value.number, unit: value.unit };
  return { text: value.text ?? '' };
}
