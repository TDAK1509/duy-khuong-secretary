import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import type { FactCompany, FactScope, FactValue, FactValueContent } from '../../facts/fact.ts';
import { resolveFactCompany } from '../../facts/resolve-fact-company.ts';
import { saveFact } from '../../facts/save-fact.ts';
import { findFactDriver, type FactDriver } from './find-fact-driver.ts';
import { refuseInvalidArgument, ToolRefusal } from './tool-result.ts';
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

export async function runSaveFact(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const request = argumentsSchema.parse(parsedArguments);
  const statement = readStatement(request.statement);
  const driver = await findFactDriver(database, scope.workspaceId, request.driver_member_id);
  const factScope = await readFactScope(database, scope.workspaceId, request, driver);
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

type ResolvedScope = FactScope & { pickup: ResolvedCompany | null; dropoff: ResolvedCompany | null };

async function readFactScope(database: Database, workspaceId: string, request: SaveFactArguments, driver: FactDriver | null): Promise<ResolvedScope> {
  const factScope = {
    vehiclePlate: readPlate(request.vehicle_plate),
    driverUserId: driver?.userId ?? null,
    pickup: await readCompany(database, workspaceId, request.pickup_company, 'pickup_company'),
    dropoff: await readCompany(database, workspaceId, request.dropoff_company, 'dropoff_company'),
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

type ResolvedCompany = FactCompany & { matchedOrganization: string | null };

async function readCompany(database: Database, workspaceId: string, raw: string | null, field: string): Promise<ResolvedCompany | null> {
  if (raw === null) return null;
  const name = raw.trim();
  const matchKey = buildMatchKey(name);
  if (matchKey === '') refuseInvalidArgument(field);
  const resolution = await resolveFactCompany(database, workspaceId, matchKey);
  if (resolution.kind === 'ambiguous') throw new ToolRefusal(describeAmbiguousCompany(name, resolution.organizationNames));
  if (resolution.kind === 'unknown') return { name, matchKey, matchedOrganization: null };
  return { name, matchKey: resolution.matchKey, matchedOrganization: resolution.organizationName };
}

function describeAmbiguousCompany(name: string, organizationNames: string[]): string {
  return `Có nhiều công ty đã lưu khớp với "${name}": ${organizationNames.join('; ')}. Hỏi lại quản lý muốn chọn công ty nào.`;
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

function describeScope(factScope: ResolvedScope, driver: FactDriver | null): Record<string, string | null> {
  return {
    vehicle_plate: factScope.vehiclePlate,
    driver: driver?.name ?? null,
    pickup_company: factScope.pickup?.name ?? null,
    pickup_company_matched: factScope.pickup?.matchedOrganization ?? null,
    dropoff_company: factScope.dropoff?.name ?? null,
    dropoff_company_matched: factScope.dropoff?.matchedOrganization ?? null,
  };
}

function describeValue({ name, content }: FactValue): Record<string, string | number> {
  if (content.kind === 'number') return { name, number: content.number, unit: content.unit };
  return { name, text: content.text };
}
