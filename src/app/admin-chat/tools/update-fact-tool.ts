import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import type { ValueChange } from '../../facts/plan-value-changes.ts';
import { describeStoredValue } from './describe-stored-value.ts';
import { flattenStatement, MAX_STATEMENT_LENGTH } from '../../facts/keep-newest-statements.ts';
import { hasFact, updateFact, type FactUpdate, type FactUpdateResult, type ScopeChange } from '../../facts/update-fact.ts';
import { splitSavedFromRefused, valueArgumentSchema, type RefusedValue } from './fact-value-arguments.ts';
import { findFactDriver } from './find-fact-driver.ts';
import { failTool, refuseInvalidArgument, ToolRefusal } from './tool-result.ts';
import { readPlateArgument } from './vehicle-plate.ts';

const SCOPE_FIELDS = ['vehicle_plate', 'driver'] as const;
const ROUTE_FIELDS = ['pickup_company', 'dropoff_company', 'customer_company'] as const;

const FACT_NOT_FOUND_ERROR = 'Không tìm thấy thông tin này. Gọi list_facts để lấy đúng id.';
const NOTHING_TO_CHANGE_ERROR = 'Không có thay đổi nào để lưu.';
const ROUTE_CHANGE_ERROR = 'update_fact không đổi nơi lấy hàng, nơi đổ hàng hay khách hàng. Một tuyến khác là một thông tin riêng: lưu nó bằng save_fact, và nếu quản lý muốn thì xóa thông tin cũ bằng delete_fact.';
const SET_AND_CLEAR_ERROR = 'Một phần phạm vi không thể vừa đổi vừa bỏ.';
const SET_AND_REMOVE_ERROR = 'Một giá trị không thể vừa đặt vừa xóa trong cùng một lần sửa.';
const UPDATE_REFUSALS: Record<Exclude<FactUpdateResult['kind'], 'updated'>, string> = {
  not_found: FACT_NOT_FOUND_ERROR,
  no_values_left: 'Không thể xóa hết giá trị. Muốn bỏ cả thông tin này thì xóa thông tin.',
  no_scope_left: 'Phạm vi cần ít nhất một trong: biển số xe, tài xế, nơi lấy hàng, nơi đổ hàng.',
  same_as_other: 'Sau khi đổi, thông tin này sẽ trùng tuyến, xe, tài xế và khách hàng với một thông tin đã lưu khác. Chưa đổi gì.',
};

const argumentsSchema = z.strictObject({
  fact_id: z.string(),
  change_statement: z.string(),
  set_values: z.array(valueArgumentSchema),
  remove_values: z.array(z.string()),
  vehicle_plate: z.string().nullable(),
  driver_member_id: z.string().nullable(),
  clear_scope: z.array(z.enum(SCOPE_FIELDS)),
});

type UpdateFactArguments = z.infer<typeof argumentsSchema>;

export async function runUpdateFact(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  if (namesRouteChange(parsedArguments)) return failTool(ROUTE_CHANGE_ERROR);
  const request = argumentsSchema.parse(parsedArguments);
  if (!z.uuid().safeParse(request.fact_id).success) return failTool(FACT_NOT_FOUND_ERROR);
  if (!(await hasFact(database, scope.workspaceId, request.fact_id))) return failTool(FACT_NOT_FOUND_ERROR);
  const parsed = await readFactUpdate(database, scope.workspaceId, request);
  if (parsed.isEmpty) return JSON.stringify({ ok: false, error: NOTHING_TO_CHANGE_ERROR, refused_values: parsed.refused });
  const result = await updateFact(database, parsed.update);
  if (result.kind === 'same_as_other') return JSON.stringify({ ok: false, error: UPDATE_REFUSALS.same_as_other, other_fact_id: result.otherFactId });
  if (result.kind !== 'updated') return failTool(UPDATE_REFUSALS[result.kind]);
  return JSON.stringify(describeUpdate(result, parsed));
}

function namesRouteChange(rawArguments: unknown): boolean {
  if (typeof rawArguments !== 'object' || rawArguments === null) return false;
  const args = rawArguments as Record<string, unknown>;
  const clears = Array.isArray(args['clear_scope']) ? args['clear_scope'] : [];
  return ROUTE_FIELDS.some((field) => (args[field] !== undefined && args[field] !== null) || clears.includes(field));
}

type ParsedUpdate = { update: FactUpdate; refused: RefusedValue[]; removeNames: Map<string, string>; isEmpty: boolean };

async function readFactUpdate(database: Database, workspaceId: string, request: UpdateFactArguments): Promise<ParsedUpdate> {
  const scopeChange = await readScopeChange(database, workspaceId, request);
  const { saved, refused } = splitSavedFromRefused(request.set_values);
  const removeNames = new Map(request.remove_values.map((name) => [readValueKey(name), name.trim()]));
  const removeValueKeys = [...removeNames.keys()];
  if (saved.some((value) => removeNames.has(value.matchKey))) throw new ToolRefusal(SET_AND_REMOVE_ERROR);
  const changeStatement = readChangeStatement(request.change_statement);
  const update = { workspaceId, factId: request.fact_id, changeStatement, setValues: saved, removeValueKeys, scopeChange };
  const isEmpty = saved.length === 0 && removeValueKeys.length === 0 && Object.keys(scopeChange).length === 0;
  return { update, refused, removeNames, isEmpty };
}

async function readScopeChange(database: Database, workspaceId: string, request: UpdateFactArguments): Promise<ScopeChange> {
  const clears = new Set(request.clear_scope);
  const driver = await findFactDriver(database, workspaceId, request.driver_member_id);
  return {
    ...pickScopeField(readPlateArgument(request.vehicle_plate), clears.has('vehicle_plate'), 'vehiclePlate'),
    ...pickScopeField(driver?.userId ?? null, clears.has('driver'), 'driverUserId'),
  };
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
  const statement = flattenStatement(raw);
  if (statement === '' || statement.length > MAX_STATEMENT_LENGTH) refuseInvalidArgument('change_statement');
  return statement;
}

function describeUpdate(result: Extract<FactUpdateResult, { kind: 'updated' }>, { refused, removeNames }: ParsedUpdate): Record<string, unknown> {
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
    },
    linked_documents: result.linkedDocuments,
  };
}

function describeChange({ name, before, after }: ValueChange): Record<string, unknown> {
  return { name, before: describeStoredValue(before), after: describeStoredValue(after) };
}
