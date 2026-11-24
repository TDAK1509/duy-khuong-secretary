export type PairingTimes = { dayMs: number; preciseMs: number | null };

export type DropOffConstraint = { key: string; resolved: boolean; picks: string[] };

export type PairingRow = { id: string; plate: string; date: string; preciseAt: string | null; times: PairingTimes; weightKg: number | null; isPossibleDuplicate: boolean; dropOff: DropOffConstraint | null };

export type PairingCandidate = { id: string; plate: string; times: PairingTimes; weightKg: number | null; receiverOrgIds: string[]; receiverKeys: string[] };

export type RulePairing = { pairs: Map<string, string> };

const MAX_WEIGHT_GAP = 0.03;
const MAX_PRECISE_GAP_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

type Edge = { rowId: string; candidateId: string; gapKg: number };

export function pairDropOffsByRule(rows: PairingRow[], candidates: PairingCandidate[]): RulePairing {
  const edges = listEdges(rows, candidates);
  const closestCandidates = mapSingleClosest(edges, (edge) => edge.rowId, (edge) => edge.candidateId);
  const closestRows = mapSingleClosest(edges, (edge) => edge.candidateId, (edge) => edge.rowId);
  const duplicateIds = new Set(rows.filter((row) => row.isPossibleDuplicate).map((row) => row.id));
  const pairs = new Map<string, string>();
  for (const [rowId, candidateId] of closestCandidates) {
    if (!duplicateIds.has(rowId) && closestRows.get(candidateId) === rowId) pairs.set(rowId, candidateId);
  }
  return { pairs };
}

function listEdges(rows: PairingRow[], candidates: PairingCandidate[]): Edge[] {
  const byPlate = groupByPlate(candidates);
  return rows.flatMap((row) => (byPlate.get(row.plate) ?? []).flatMap((candidate) => {
    const gapKg = canPair(row, candidate) ? readSimilarWeightGap(row, candidate) : null;
    return gapKg === null ? [] : [{ rowId: row.id, candidateId: candidate.id, gapKg }];
  }));
}

function mapSingleClosest(edges: Edge[], readKey: (edge: Edge) => string, readOther: (edge: Edge) => string): Map<string, string> {
  const closest = new Map<string, { other: string; gapKg: number; isTied: boolean }>();
  for (const edge of edges) {
    const best = closest.get(readKey(edge));
    if (best === undefined || edge.gapKg < best.gapKg) closest.set(readKey(edge), { other: readOther(edge), gapKg: edge.gapKg, isTied: false });
    else if (edge.gapKg === best.gapKg) best.isTied = true;
  }
  return new Map([...closest].filter(([, best]) => !best.isTied).map(([key, best]) => [key, best.other]));
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

function readSimilarWeightGap(row: PairingRow, candidate: PairingCandidate): number | null {
  if (row.weightKg === null || candidate.weightKg === null) return null;
  const larger = Math.max(row.weightKg, candidate.weightKg);
  const gapKg = Math.abs(row.weightKg - candidate.weightKg);
  return larger > 0 && gapKg / larger <= MAX_WEIGHT_GAP ? gapKg : null;
}
