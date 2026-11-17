import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import { listFacts, type ListedFact, type ListedFactValue } from '../../facts/list-facts.ts';
import { formatVietnamDate } from '../../time/format-vietnam-date.ts';
import { formatVietnamTime } from '../../time/format-vietnam-time.ts';
import { findFactDriver } from './find-fact-driver.ts';
import { refuseInvalidArgument } from './tool-result.ts';
import { readPlateArgument } from './vehicle-plate.ts';

const argumentsSchema = z.strictObject({
  vehicle_plate: z.string().nullable(),
  driver_member_id: z.string().nullable(),
  company: z.string().nullable(),
});

export async function runListFacts(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const request = argumentsSchema.parse(parsedArguments);
  const driver = await findFactDriver(database, scope.workspaceId, request.driver_member_id);
  const filter = { vehiclePlate: readPlateArgument(request.vehicle_plate), driverUserId: driver?.userId ?? null, companyMatchKey: readCompanyFilter(request.company) };
  const facts = await listFacts(database, scope.workspaceId, filter);
  return JSON.stringify({ facts: facts.map(describeFact) });
}

function readCompanyFilter(raw: string | null): string | null {
  if (raw === null) return null;
  const matchKey = buildMatchKey(raw);
  if (matchKey === '') refuseInvalidArgument('company');
  return matchKey;
}

function describeFact(fact: ListedFact): Record<string, unknown> {
  return {
    id: fact.id,
    statement: fact.statement,
    scope: { vehicle_plate: fact.vehiclePlate, driver: fact.driverName, pickup_company: fact.pickupName, dropoff_company: fact.dropoffName },
    values: fact.values.map(describeValue),
    linked_documents: fact.linkedDocuments,
    updated_at: `${formatVietnamTime(fact.updatedAt)} ${formatVietnamDate(fact.updatedAt)}`,
  };
}

function describeValue({ name, number, unit, text }: ListedFactValue): Record<string, string> {
  if (number !== null && unit !== null) return { name, number, unit };
  return { name, text: text ?? '' };
}
