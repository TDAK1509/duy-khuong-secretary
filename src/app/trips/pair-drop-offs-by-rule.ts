export type PairingTimes = { dayMs: number; preciseMs: number | null };

export type DropOffConstraint = { key: string; resolved: boolean; picks: string[] };

export type PairingRow = { id: string; plate: string; date: string; preciseAt: string | null; times: PairingTimes; weightKg: number | null; isPossibleDuplicate: boolean; dropOff: DropOffConstraint | null };

export type PairingCandidate = { id: string; plate: string; times: PairingTimes; weightKg: number | null; receiverOrgIds: string[]; receiverKeys: string[] };

export type RulePairing = { pairs: Map<string, string> };

const MAX_WEIGHT_GAP = 0.03;
const MAX_PRECISE_GAP_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

export function pairDropOffsByRule(rows: PairingRow[], candidates: PairingCandidate[]): RulePairing {
  const byPlate = groupByPlate(candidates);
  const edges = rows.map((row) => ({ row, matches: (byPlate.get(row.plate) ?? []).filter((candidate) => canPair(row, candidate) && haveSimilarWeights(row, candidate)) }));
  const edgeCounts = countCandidateEdges(edges.flatMap((edge) => edge.matches));
  const pairs = new Map<string, string>();
  for (const { row, matches } of edges) {
    const [only] = matches;
    if (row.isPossibleDuplicate || matches.length !== 1 || only === undefined || edgeCounts.get(only.id) !== 1) continue;
    pairs.set(row.id, only.id);
  }
  return { pairs };
}

export function groupByPlate<Candidate extends { plate: string }>(candidates: Candidate[]): Map<string, Candidate[]> {
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) groups.set(candidate.plate, [...(groups.get(candidate.plate) ?? []), candidate]);
  return groups;
}

export function canPair(row: PairingRow, candidate: PairingCandidate): boolean {
  return isInWindow(row, candidate) && isNamedDropOff(row.dropOff, candidate);
}

function isNamedDropOff(dropOff: DropOffConstraint | null, candidate: PairingCandidate): boolean {
  if (dropOff === null) return true;
  return dropOff.resolved ? dropOff.picks.some((pick) => candidate.receiverOrgIds.includes(pick)) : candidate.receiverKeys.includes(dropOff.key);
}

function isInWindow(row: PairingRow, candidate: PairingCandidate): boolean {
  if (row.plate !== candidate.plate) return false;
  if (row.times.preciseMs !== null && candidate.times.preciseMs !== null) {
    const gap = candidate.times.preciseMs - row.times.preciseMs;
    return gap > 0 && gap <= MAX_PRECISE_GAP_MS;
  }
  const dayGap = (candidate.times.dayMs - row.times.dayMs) / DAY_MS;
  return dayGap === 0 || dayGap === 1;
}

export function readPairingTimes(date: string, preciseAt: string | null): PairingTimes {
  return { dayMs: Date.parse(`${date}T00:00Z`), preciseMs: preciseAt === null ? null : Date.parse(`${preciseAt}Z`) };
}

function haveSimilarWeights(row: PairingRow, candidate: PairingCandidate): boolean {
  if (row.weightKg === null || candidate.weightKg === null) return false;
  const larger = Math.max(row.weightKg, candidate.weightKg);
  return larger > 0 && Math.abs(row.weightKg - candidate.weightKg) / larger <= MAX_WEIGHT_GAP;
}

function countCandidateEdges(matches: PairingCandidate[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const candidate of matches) counts.set(candidate.id, (counts.get(candidate.id) ?? 0) + 1);
  return counts;
}
