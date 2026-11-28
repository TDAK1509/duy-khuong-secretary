import type { Transaction } from '../db/transaction.ts';
import type { StoredEntry, StoredSide } from './company-knowledge.ts';
import { isSameCompany, listSides, loadAliases, readGoodsKey, type AliasIndex } from './knowledge-identity.ts';
import { FACT_COMPANY_SLOTS } from './pick-fact-companies.ts';
import { selectEntries } from './select-entries.ts';

export type OverlapContext = { others: StoredEntry[]; aliases: AliasIndex };

export async function loadOverlapContext(transaction: Transaction, workspaceId: string, entry: StoredEntry): Promise<OverlapContext> {
  const others = await selectEntries(transaction, { where: 'entry.workspace_id = $1 AND entry.id <> $2', values: [workspaceId, entry.id] });
  const aliases = await loadAliases(transaction, workspaceId, [entry, ...others].flatMap(listSides));
  return { others, aliases };
}

export function listOverlappingEntries(entry: StoredEntry, context: OverlapContext): StoredEntry[] {
  return context.others.filter((other) => hasCompatibleBasics(entry, other) && FACT_COMPANY_SLOTS.every((slot) => hasCompatibleCompany(entry.sides[slot], other.sides[slot], context.aliases)));
}

export function listSameRouteEntries(entry: StoredEntry, context: OverlapContext): StoredEntry[] {
  return context.others.filter((other) => hasCompatibleBasics(entry, other) && hasSameRoute(entry, other, context.aliases));
}

function hasSameRoute(entry: StoredEntry, other: StoredEntry, aliases: AliasIndex): boolean {
  const { pickup, dropoff } = entry.sides;
  if (pickup.matchKey === null || dropoff.matchKey === null || other.sides.pickup.matchKey === null || other.sides.dropoff.matchKey === null) return false;
  return isSameCompany(pickup, other.sides.pickup, aliases) && !isSameCompany(dropoff, other.sides.dropoff, aliases);
}

function hasCompatibleBasics(entry: StoredEntry, other: StoredEntry): boolean {
  return isCompatible(readGoodsKey(entry.goods) || null, readGoodsKey(other.goods) || null)
    && isCompatible(entry.vehiclePlate, other.vehiclePlate)
    && isCompatible(entry.driverUserId, other.driverUserId);
}

function isCompatible(first: string | null, second: string | null): boolean {
  return first === null || second === null || first === second;
}

function hasCompatibleCompany(first: StoredSide, second: StoredSide, aliases: AliasIndex): boolean {
  return first.matchKey === null || second.matchKey === null || isSameCompany(first, second, aliases);
}
