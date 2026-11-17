import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import type { FactCompany, FactScope, FactValue, FactValueContent } from '../../facts/fact.ts';
import { saveFact } from '../../facts/save-fact.ts';
import { MEMBER_NOT_FOUND_ERROR, refuseInvalidArgument, ToolRefusal } from './tool-result.ts';
import { isVehiclePlate, normalizePlate } from './vehicle-plate.ts';

const MAX_STATEMENT_LENGTH = 2000;
const MAX_VALUE_NAME_LENGTH = 80;
const VALUE_UNITS = ['đ', 'đ/tấn'];

const SCOPE_MISSING_ERROR = 'Cần ít nhất một trong: biển số xe, tài xế, nơi lấy hàng, nơi đổ hàng.';
const NO_VALUE_SAVED_ERROR = 'Không lưu được giá trị nào, nên chưa lưu thông tin này.';
const INVALID_VALUE_NAME_REASON = 'Tên giá trị phải có từ 1 đến 80 ký tự và có chữ hoặc số.';
const DUPLICATE_VALUE_NAME_REASON = 'Trùng tên với một giá trị khác trong cùng thông tin.';
const INVALID_VALUE_KIND_REASON = 'Giá trị phải là một số kèm đơn vị, hoặc là chữ, không phải cả hai.';
const INVALID_UNIT_REASON = 'Đơn vị phải là "đ" (mỗi chuyến) hoặc "đ/tấn" (mỗi tấn).';
const NEGATIVE_NUMBER_REASON = 'Số tiền phải lớn hơn hoặc bằng 0.';

const valueSchema = z.strictObject({
  name: z.string(),
  number: z.number().nullable(),
  unit: z.string().nullable(),
  text: z.string().nullable(),
});

const argumentsSchema = z.strictObject({
  statement: z.string(),
  vehicle_plate: z.string().nullable(),
  driver_member_id: z.string().nullable(),
  pickup_company: z.string().nullable(),
  dropoff_company: z.string().nullable(),
  values: z.array(valueSchema),
});

type SaveFactArguments = z.infer<typeof argumentsSchema>;
type ValueArgument = z.infer<typeof valueSchema>;
type RefusedValue = { name: string; reason: string };
type Driver = { userId: string; name: string };

export async function runSaveFact(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const request = argumentsSchema.parse(parsedArguments);
  const statement = readStatement(request.statement);
  const driver = await findDriver(database, scope.workspaceId, request.driver_member_id);
  const factScope = readFactScope(request, driver);
  const { saved, refused } = splitSavedFromRefused(request.values);
  if (saved.length === 0) return JSON.stringify({ ok: false, error: NO_VALUE_SAVED_ERROR, refused_values: refused });
  const fact = await saveFact(database, { workspaceId: scope.workspaceId, authorUserId: scope.userId, statement, scope: factScope, values: saved });
  return JSON.stringify({ ok: true, fact_id: fact.factId, scope: describeScope(factScope, driver), values: saved.map(describeValue), refused_values: refused, linked_documents: fact.linkedDocuments });
}

function readStatement(raw: string): string {
  const statement = raw.trim();
  if (statement === '' || statement.length > MAX_STATEMENT_LENGTH) refuseInvalidArgument('statement');
  return statement;
}

async function findDriver(database: Database, workspaceId: string, memberId: string | null): Promise<Driver | null> {
  if (memberId === null) return null;
  if (!z.uuid().safeParse(memberId).success) throw new ToolRefusal(MEMBER_NOT_FOUND_ERROR);
  const { rows } = await database.query<{ user_id: string; display_name: string }>(
    'SELECT user_id, display_name FROM memberships WHERE id = $1 AND workspace_id = $2',
    [memberId, workspaceId],
  );
  const [row] = rows;
  if (row === undefined) throw new ToolRefusal(MEMBER_NOT_FOUND_ERROR);
  return { userId: row.user_id, name: row.display_name };
}

function readFactScope(request: SaveFactArguments, driver: Driver | null): FactScope {
  const factScope = {
    vehiclePlate: readPlate(request.vehicle_plate),
    driverUserId: driver?.userId ?? null,
    pickup: readCompany(request.pickup_company, 'pickup_company'),
    dropoff: readCompany(request.dropoff_company, 'dropoff_company'),
  };
  const isEmpty = Object.values(factScope).every((part) => part === null);
  if (isEmpty) throw new ToolRefusal(SCOPE_MISSING_ERROR);
  return factScope;
}

function readPlate(raw: string | null): string | null {
  if (raw === null) return null;
  const plate = normalizePlate(raw);
  if (!isVehiclePlate(plate)) refuseInvalidArgument('vehicle_plate');
  return plate;
}

function readCompany(raw: string | null, field: string): FactCompany | null {
  if (raw === null) return null;
  const name = raw.trim();
  const matchKey = buildMatchKey(name);
  if (matchKey === '') refuseInvalidArgument(field);
  return { name, matchKey };
}

function splitSavedFromRefused(values: ValueArgument[]): { saved: FactValue[]; refused: RefusedValue[] } {
  const saved: FactValue[] = [];
  const refused: RefusedValue[] = [];
  for (const value of values) {
    const reason = findRefusalReason(value, saved);
    if (reason === null) saved.push(toFactValue(value));
    else refused.push({ name: value.name, reason });
  }
  return { saved, refused };
}

function findRefusalReason(value: ValueArgument, saved: FactValue[]): string | null {
  const name = value.name.trim();
  const matchKey = buildMatchKey(name);
  if (matchKey === '' || name.length > MAX_VALUE_NAME_LENGTH) return INVALID_VALUE_NAME_REASON;
  if (saved.some((other) => other.matchKey === matchKey)) return DUPLICATE_VALUE_NAME_REASON;
  return findContentRefusalReason(value);
}

function findContentRefusalReason({ number, unit, text }: ValueArgument): string | null {
  const hasText = text !== null && text.trim() !== '';
  const hasNumber = number !== null;
  if (hasText === hasNumber || hasNumber !== (unit !== null)) return INVALID_VALUE_KIND_REASON;
  if (number === null) return null;
  if (!VALUE_UNITS.includes(unit?.trim() ?? '')) return INVALID_UNIT_REASON;
  return number >= 0 && Number.isFinite(number) ? null : NEGATIVE_NUMBER_REASON;
}

function toFactValue(value: ValueArgument): FactValue {
  const name = value.name.trim();
  return { name, matchKey: buildMatchKey(name), content: readContent(value) };
}

function readContent({ number, unit, text }: ValueArgument): FactValueContent {
  if (number !== null && unit !== null) return { kind: 'number', number, unit: unit.trim() };
  return { kind: 'text', text: (text ?? '').trim() };
}

function describeScope(factScope: FactScope, driver: Driver | null): Record<string, string | null> {
  return {
    vehicle_plate: factScope.vehiclePlate,
    driver: driver?.name ?? null,
    pickup_company: factScope.pickup?.name ?? null,
    dropoff_company: factScope.dropoff?.name ?? null,
  };
}

function describeValue({ name, content }: FactValue): Record<string, string | number> {
  if (content.kind === 'number') return { name, number: content.number, unit: content.unit };
  return { name, text: content.text };
}
