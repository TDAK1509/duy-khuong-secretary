export type PairingRow = { id: string; plate: string; date: string; preciseAt: string | null; weightKg: number | null; isEligible: boolean; isPossibleDuplicate: boolean };

export type PairingCandidate = { id: string; plate: string; date: string; preciseAt: string | null; weightKg: number | null };

export type RulePairing = { pairs: Map<string, string>; taken: Set<string> };

const MAX_WEIGHT_GAP = 0.03;
const MAX_PRECISE_GAP_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

export function pairDropOffsByRule(rows: PairingRow[], candidates: PairingCandidate[]): RulePairing {
  const edges = rows.map((row) => ({ row, matches: candidates.filter((candidate) => isInWindow(row, candidate) && haveSimilarWeights(row, candidate)) }));
  const edgeCounts = countCandidateEdges(edges.flatMap((edge) => edge.matches));
  const pairs = new Map<string, string>();
  const taken = new Set<string>();
  for (const { row, matches } of edges) {
    const [only] = matches;
    if (matches.length !== 1 || only === undefined || edgeCounts.get(only.id) !== 1 || row.isPossibleDuplicate) continue;
    taken.add(only.id);
    if (row.isEligible) pairs.set(row.id, only.id);
  }
  return { pairs, taken };
}

export function isInWindow(row: PairingRow, candidate: PairingCandidate): boolean {
  if (row.plate !== candidate.plate) return false;
  if (row.preciseAt !== null && candidate.preciseAt !== null) {
    const gap = readLocalTime(candidate.preciseAt) - readLocalTime(row.preciseAt);
    return gap > 0 && gap <= MAX_PRECISE_GAP_MS;
  }
  const dayGap = (readLocalTime(candidate.date) - readLocalTime(row.date)) / DAY_MS;
  return dayGap === 0 || dayGap === 1;
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

function readLocalTime(text: string): number {
  return Date.parse(text.length === 10 ? `${text}T00:00Z` : `${text}Z`);
}
