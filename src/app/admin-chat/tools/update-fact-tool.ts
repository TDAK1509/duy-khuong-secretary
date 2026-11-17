import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import type { StoredValue, ValueChange } from '../../facts/plan-value-changes.ts';
import { updateFact, type FactUpdate, type FactUpdateResult, type ScopeChange } from '../../facts/update-fact.ts';
import { readCompanyArgument, type ResolvedCompany } from './fact-company-argument.ts';
import { splitSavedFromRefused, valueArgumentSchema, type RefusedValue } from './fact-value-arguments.ts';
import { findFactDriver } from './find-fact-driver.ts';
import { failTool, refuseInvalidArgument, ToolRefusal } from './tool-result.ts';
import { readPlateArgument } from './vehicle-plate.ts';

const SCOPE_FIELDS = ['vehicle_plate', 'driver', 'pickup_company', 'dropoff_company'] as const;

const FACT_NOT_FOUND_ERROR = 'Không tìm thấy thông tin này. Gọi list_facts để lấy đúng id.';
const NOTHING_TO_CHANGE_ERROR = 'Không có thay đổi nào để lưu.';
const SET_AND_CLEAR_ERROR = 'Một phần phạm vi không thể vừa đổi vừa bỏ.';
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
  clear_scope: z.array(z.enum(SCOPE_FIELDS)),
});

type UpdateFactArguments = z.infer<typeof argumentsSchema>;
type ResolvedChange = { scopeChange: ScopeChange; pickup: ResolvedCompany | null; dropoff: ResolvedCompany | null };

export async function runUpdateFact(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const request = argumentsSchema.parse(parsedArguments);
  if (!z.uuid().safeParse(request.fact_id).success) return failTool(FACT_NOT_FOUND_ERROR);
  const parsed = await readFactUpdate(database, scope.workspaceId, request);
  if (parsed.isEmpty) return JSON.stringify({ ok: false, error: NOTHING_TO_CHANGE_ERROR, refused_values: parsed.refused });
  const result = await updateFact(database, parsed.update);
  if (result.kind !== 'updated') return failTool(UPDATE_REFUSALS[result.kind]);
  return JSON.stringify(describeUpdate(result, parsed));
}

type ParsedUpdate = { update: FactUpdate; resolved: ResolvedChange; refused: RefusedValue[]; removeNames: Map<string, string>; isEmpty: boolean };

async function readFactUpdate(database: Database, workspaceId: string, request: UpdateFactArguments): Promise<ParsedUpdate> {
  const resolved = await readScopeChange(database, workspaceId, request);
  const { saved, refused } = splitSavedFromRefused(request.set_values);
  const removeNames = new Map(request.remove_values.map((name) => [readValueKey(name), name.trim()]));
  const removeValueKeys = [...removeNames.keys()];
  const changeStatement = readChangeStatement(request.change_statement);
  const update = { workspaceId, factId: request.fact_id, changeStatement, setValues: saved, removeValueKeys, scopeChange: resolved.scopeChange };
  const isEmpty = saved.length === 0 && removeValueKeys.length === 0 && Object.keys(resolved.scopeChange).length === 0;
  return { update, resolved, refused, removeNames, isEmpty };
}

async function readScopeChange(database: Database, workspaceId: string, request: UpdateFactArguments): Promise<ResolvedChange> {
  const clears = new Set(request.clear_scope);
  const driver = await findFactDriver(database, workspaceId, request.driver_member_id);
  const pickup = await readCompanyArgument(database, workspaceId, request.pickup_company, 'pickup_company');
  const dropoff = await readCompanyArgument(database, workspaceId, request.dropoff_company, 'dropoff_company');
  const scopeChange = {
    ...pickScopeField(readPlateArgument(request.vehicle_plate), clears.has('vehicle_plate'), 'vehiclePlate'),
    ...pickScopeField(driver?.userId ?? null, clears.has('driver'), 'driverUserId'),
    ...pickScopeField(pickup, clears.has('pickup_company'), 'pickup'),
    ...pickScopeField(dropoff, clears.has('dropoff_company'), 'dropoff'),
  };
  return { scopeChange, pickup, dropoff };
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
      ...(resolved.pickup ? { pickup_company_matched: resolved.pickup.matchedOrganization } : {}),
      ...(resolved.dropoff ? { dropoff_company_matched: resolved.dropoff.matchedOrganization } : {}),
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
