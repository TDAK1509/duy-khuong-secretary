import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import type { FactScope } from '../../facts/fact.ts';
import { saveFact } from '../../facts/save-fact.ts';
import { readCompanyArgument, type ResolvedCompany } from './fact-company-argument.ts';
import { addCustomerValue, describeFactValue, splitSavedFromRefused, valueArgumentSchema } from './fact-value-arguments.ts';
import { findFactDriver, type FactDriver } from './find-fact-driver.ts';
import { refuseInvalidArgument, ToolRefusal } from './tool-result.ts';
import { readPlateArgument } from './vehicle-plate.ts';

const MAX_STATEMENT_LENGTH = 2000;

const SCOPE_MISSING_ERROR = 'Cần ít nhất một trong: biển số xe, tài xế, nơi lấy hàng, nơi đổ hàng.';
const NO_VALUE_SAVED_ERROR = 'Không lưu được giá trị nào, nên chưa lưu thông tin này.';

const argumentsSchema = z.strictObject({
  statement: z.string(),
  vehicle_plate: z.string().nullable(),
  driver_member_id: z.string().nullable(),
  pickup_company: z.string().nullable(),
  dropoff_company: z.string().nullable(),
  customer_company: z.string().nullable(),
  values: z.array(valueArgumentSchema),
});

type SaveFactArguments = z.infer<typeof argumentsSchema>;

export async function runSaveFact(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const request = argumentsSchema.parse(parsedArguments);
  const statement = readStatement(request.statement);
  const driver = await findFactDriver(database, scope.workspaceId, request.driver_member_id);
  const factScope = await readFactScope(database, scope.workspaceId, request, driver);
  const { saved, refused } = splitSavedFromRefused(request.values);
  if (saved.length === 0) return JSON.stringify({ ok: false, error: NO_VALUE_SAVED_ERROR, refused_values: refused });
  const values = addCustomerValue(saved, factScope.customer);
  const fact = await saveFact(database, { workspaceId: scope.workspaceId, authorUserId: scope.userId, statement, scope: factScope, values });
  return JSON.stringify({ ok: true, fact_id: fact.factId, scope: describeScope(factScope, driver), values: values.map(describeFactValue), refused_values: refused, linked_documents: fact.linkedDocuments });
}

function readStatement(raw: string): string {
  const statement = raw.trim();
  if (statement === '' || statement.length > MAX_STATEMENT_LENGTH) refuseInvalidArgument('statement');
  return statement;
}

type ResolvedScope = FactScope & { pickup: ResolvedCompany | null; dropoff: ResolvedCompany | null; customer: ResolvedCompany | null };

async function readFactScope(database: Database, workspaceId: string, request: SaveFactArguments, driver: FactDriver | null): Promise<ResolvedScope> {
  const factScope = {
    vehiclePlate: readPlateArgument(request.vehicle_plate),
    driverUserId: driver?.userId ?? null,
    pickup: await readCompanyArgument(database, workspaceId, request.pickup_company, 'pickup_company'),
    dropoff: await readCompanyArgument(database, workspaceId, request.dropoff_company, 'dropoff_company'),
    customer: await readCompanyArgument(database, workspaceId, request.customer_company, 'customer_company'),
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

