import type { Transaction } from '../db/transaction.ts';
import type { FactCompany } from './fact.ts';
import { COMPANY_SLOTS, type CompanySlot } from './pick-fact-companies.ts';

export type RouteSide = { matchKey: string | null; resolved: boolean; picks: string[] };

export type RouteIdentity = { vehiclePlate: string | null; driverUserId: string | null } & Record<CompanySlot, RouteSide>;

export type RouteFact = RouteIdentity & { id: string; pickupName: string | null; dropoffName: string | null; customerName: string | null };

type RouteFactRow = {
  id: string;
  vehicle_plate: string | null;
  driver_user_id: string | null;
  pickup_name: string | null;
  pickup_match_key: string | null;
  pickup_resolved: boolean;
  pickup_picks: string[];
  dropoff_name: string | null;
  dropoff_match_key: string | null;
  dropoff_resolved: boolean;
  dropoff_picks: string[];
  customer_name: string | null;
  customer_match_key: string | null;
  customer_resolved: boolean;
  customer_picks: string[];
};

const SELECT_ROUTE_FACTS_SQL = `
  SELECT fact.id, fact.vehicle_plate, fact.driver_user_id,
    fact.pickup_name, fact.pickup_match_key, fact.pickup_resolved, ${buildPicksSql('pickup')} AS pickup_picks,
    fact.dropoff_name, fact.dropoff_match_key, fact.dropoff_resolved, ${buildPicksSql('dropoff')} AS dropoff_picks,
    fact.customer_name, fact.customer_match_key, fact.customer_resolved, ${buildPicksSql('customer')} AS customer_picks
  FROM facts fact`;

const LIST_ROUTE_FACTS_SQL = `${SELECT_ROUTE_FACTS_SQL}
  WHERE fact.workspace_id = $1 AND (fact.pickup_match_key IS NOT NULL OR fact.dropoff_match_key IS NOT NULL)
    AND fact.vehicle_plate IS NOT DISTINCT FROM $2 AND fact.driver_user_id IS NOT DISTINCT FROM $3
  ORDER BY fact.created_at, fact.id`;

const LOAD_ROUTE_FACT_SQL = `${SELECT_ROUTE_FACTS_SQL} WHERE fact.id = $1 AND fact.workspace_id = $2`;

const LIST_ALIASES_SQL = 'SELECT match_key, organization_id::text AS organization_id FROM organization_aliases WHERE workspace_id = $1 AND match_key = ANY($2::text[])';

export function isRouteIdentity(identity: RouteIdentity): boolean {
  return identity.pickup.matchKey !== null || identity.dropoff.matchKey !== null;
}

export function describeNewSide(company: FactCompany | null): RouteSide {
  return { matchKey: company?.matchKey ?? null, resolved: company !== null && company.organizationIds !== null, picks: company?.organizationIds ?? [] };
}

export async function findSameRouteFacts(transaction: Transaction, workspaceId: string, identity: RouteIdentity): Promise<RouteFact[]> {
  const rows = await transaction.query<RouteFactRow>(LIST_ROUTE_FACTS_SQL, [workspaceId, identity.vehiclePlate, identity.driverUserId]);
  const facts = rows.map(toRouteFact);
  const aliases = await loadAliases(transaction, workspaceId, [identity, ...facts]);
  return facts.filter((fact) => COMPANY_SLOTS.every((slot) => isSameCompany(identity[slot], fact[slot], aliases)));
}

export type ScopeOwner = { vehiclePlate: string | null; driverUserId: string | null };

export async function findRouteFactTwin(transaction: Transaction, workspaceId: string, factId: string, owner: ScopeOwner): Promise<RouteFact | null> {
  const [row] = await transaction.query<RouteFactRow>(LOAD_ROUTE_FACT_SQL, [factId, workspaceId]);
  if (row === undefined) return null;
  const fact = toRouteFact(row);
  if (!isRouteIdentity(fact)) return null;
  const matches = await findSameRouteFacts(transaction, workspaceId, { ...fact, ...owner });
  return matches.find((match) => match.id !== factId) ?? null;
}

function buildPicksSql(slot: CompanySlot): string {
  return `coalesce((SELECT array_agg(pick.organization_id::text) FROM fact_companies pick WHERE pick.fact_id = fact.id AND pick.slot = '${slot}'), '{}')`;
}

function toRouteFact(row: RouteFactRow): RouteFact {
  return {
    id: row.id,
    vehiclePlate: row.vehicle_plate,
    driverUserId: row.driver_user_id,
    pickupName: row.pickup_name,
    dropoffName: row.dropoff_name,
    customerName: row.customer_name,
    pickup: { matchKey: row.pickup_match_key, resolved: row.pickup_resolved, picks: row.pickup_picks },
    dropoff: { matchKey: row.dropoff_match_key, resolved: row.dropoff_resolved, picks: row.dropoff_picks },
    customer: { matchKey: row.customer_match_key, resolved: row.customer_resolved, picks: row.customer_picks },
  };
}

type AliasIndex = Map<string, Set<string>>;

async function loadAliases(transaction: Transaction, workspaceId: string, identities: RouteIdentity[]): Promise<AliasIndex> {
  const keys = [...new Set(identities.flatMap((identity) => COMPANY_SLOTS.flatMap((slot) => identity[slot].matchKey ?? [])))];
  const rows = await transaction.query<{ match_key: string; organization_id: string }>(LIST_ALIASES_SQL, [workspaceId, keys]);
  const index: AliasIndex = new Map();
  for (const row of rows) index.set(row.match_key, new Set([...(index.get(row.match_key) ?? []), row.organization_id]));
  return index;
}

function isSameCompany(first: RouteSide, second: RouteSide, aliases: AliasIndex): boolean {
  if (first.matchKey === null || second.matchKey === null) return first.matchKey === second.matchKey;
  if (first.matchKey === second.matchKey) return true;
  if (isResolvedToNothing(first) || isResolvedToNothing(second)) return false;
  if (first.picks.some((pick) => second.picks.includes(pick))) return true;
  return isAliasOfPick(first, second, aliases) || isAliasOfPick(second, first, aliases);
}

function isResolvedToNothing(side: RouteSide): boolean {
  return side.resolved && side.picks.length === 0;
}

function isAliasOfPick(picked: RouteSide, named: RouteSide, aliases: AliasIndex): boolean {
  const organizations = aliases.get(named.matchKey ?? '') ?? new Set<string>();
  return picked.picks.some((pick) => organizations.has(pick));
}
