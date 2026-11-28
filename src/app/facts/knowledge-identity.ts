import type { Transaction } from '../db/transaction.ts';
import { buildMatchKey } from '../documents/build-match-key.ts';
import type { KnowledgeCompany, StoredEntry, StoredSide } from './company-knowledge.ts';
import { FACT_COMPANY_SLOTS } from './pick-fact-companies.ts';
import { selectEntries } from './select-entries.ts';

export type KnowledgeIdentity = {
  vehiclePlate: string | null;
  driverUserId: string | null;
  goods: string | null;
  pickup: StoredSide;
  dropoff: StoredSide;
};

const LIST_ALIASES_SQL = 'SELECT match_key, organization_id::text AS organization_id FROM organization_aliases WHERE workspace_id = $1 AND match_key = ANY($2::text[])';

const SAME_PLATE_AND_DRIVER = 'entry.workspace_id = $1 AND entry.when_vehicle_plate IS NOT DISTINCT FROM $2 AND entry.when_driver_user_id IS NOT DISTINCT FROM $3';

export function describeNewSide(company: KnowledgeCompany | null): StoredSide {
  return { name: company?.name ?? null, matchKey: company?.matchKey ?? null, resolved: company !== null && company.organizationIds !== null, picks: company?.organizationIds ?? [] };
}

export async function findSameConditions(transaction: Transaction, workspaceId: string, identity: KnowledgeIdentity): Promise<StoredEntry[]> {
  const where = { where: SAME_PLATE_AND_DRIVER, values: [workspaceId, identity.vehiclePlate, identity.driverUserId] };
  const entries = await selectEntries(transaction, where);
  const aliases = await loadAliases(transaction, workspaceId, [identity.pickup, identity.dropoff, ...entries.flatMap(listSides)]);
  return entries.filter((entry) => isSameGoods(identity, entry) && FACT_COMPANY_SLOTS.every((slot) => isSameCompany(identity[slot], entry.sides[slot], aliases)));
}

export function listSides(entry: StoredEntry): StoredSide[] {
  return FACT_COMPANY_SLOTS.map((slot) => entry.sides[slot]);
}

export type AliasIndex = Map<string, Set<string>>;

export async function loadAliases(transaction: Transaction, workspaceId: string, sides: StoredSide[]): Promise<AliasIndex> {
  const keys = [...new Set(sides.flatMap((side) => side.matchKey ?? []))];
  const rows = await transaction.query<{ match_key: string; organization_id: string }>(LIST_ALIASES_SQL, [workspaceId, keys]);
  const index: AliasIndex = new Map();
  for (const row of rows) index.set(row.match_key, new Set([...(index.get(row.match_key) ?? []), row.organization_id]));
  return index;
}

function isSameGoods(identity: KnowledgeIdentity, entry: StoredEntry): boolean {
  return identity.goods === null || identity.goods === readGoodsKey(entry.goods);
}

export function readGoodsKey(goods: string | null): string {
  return buildMatchKey(goods ?? '');
}

export function isSameCompany(first: StoredSide, second: StoredSide, aliases: AliasIndex): boolean {
  if (first.matchKey === null || second.matchKey === null) return first.matchKey === second.matchKey;
  if (first.matchKey === second.matchKey) return true;
  if (isResolvedToNothing(first) || isResolvedToNothing(second)) return false;
  if (first.picks.some((pick) => second.picks.includes(pick))) return true;
  return isAliasOfPick(first, second, aliases) || isAliasOfPick(second, first, aliases);
}

function isResolvedToNothing(side: StoredSide): boolean {
  return side.resolved && side.picks.length === 0;
}

function isAliasOfPick(picked: StoredSide, named: StoredSide, aliases: AliasIndex): boolean {
  const organizations = aliases.get(named.matchKey ?? '') ?? new Set<string>();
  return picked.picks.some((pick) => organizations.has(pick));
}
