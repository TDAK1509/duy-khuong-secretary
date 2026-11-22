import type { ReaderService } from '../../services/reading/reader-service.ts';
import type { TripPaper } from './list-trip-papers.ts';
import { pairDropOffsInBatches, type ModelCandidate, type ModelPairing, type ModelRow } from './pair-drop-offs-by-model.ts';
import { canPair, groupByPlate, pairDropOffsByRule, readPairingTimes, type PairingCandidate, type PairingRow } from './pair-drop-offs-by-rule.ts';
import { groupPossibleDuplicates, readPickupPlace, readWeightKg } from './read-trip-paper.ts';

export type PairMethod = 'rule' | 'ai';

export type PairedReceipt = { receiptId: string; method: PairMethod };

export type TripPairing = { pairs: Map<string, PairedReceipt>; modelCalls: ModelPairing[]; modelSkippedRows: number };

export type PairingPapers = { pickups: TripPaper[]; receipts: TripPaper[] };

type DatedPaper = TripPaper & { vehicle_plate: string; document_date: string };

export async function pairTrips(reader: ReaderService | null, { pickups, receipts }: PairingPapers): Promise<TripPairing> {
  const duplicateIds = new Set(groupPossibleDuplicates(pickups).flat().map((paper) => paper.id));
  const rows = pickups.filter(isDated).map((paper) => toPairingRow(paper, duplicateIds));
  const candidates = receipts.filter(isDated).filter((paper) => paper.receiver_name !== null);
  const pairingCandidates = candidates.map(toPairingCandidate);
  const rule = pairDropOffsByRule(rows, pairingCandidates);
  const modelRows = listModelRows(rows, pickups, pairingCandidates, rule.pairs);
  const batched = await pairDropOffsInBatches(reader, modelRows, candidates.map(toModelCandidate));
  const pairs = new Map<string, PairedReceipt>();
  for (const [pickupId, receiptId] of rule.pairs) pairs.set(pickupId, { receiptId, method: 'rule' });
  for (const [pickupId, receiptId] of batched.pairs) pairs.set(pickupId, { receiptId, method: 'ai' });
  logPairing(pairs, batched.calls);
  return { pairs, modelCalls: batched.calls, modelSkippedRows: batched.skippedRows };
}

function isDated(paper: TripPaper): paper is DatedPaper {
  return paper.vehicle_plate !== null && paper.document_date !== null;
}

function toPairingRow(paper: DatedPaper, duplicateIds: Set<string>): PairingRow {
  return {
    id: paper.id,
    plate: paper.vehicle_plate,
    date: paper.document_date,
    preciseAt: paper.precise_at,
    times: readPairingTimes(paper.document_date, paper.precise_at),
    weightKg: readWeightKg(paper),
    isPossibleDuplicate: duplicateIds.has(paper.id),
    dropOff: readDropOffConstraint(paper),
  };
}

function readDropOffConstraint(paper: TripPaper): PairingRow['dropOff'] {
  if (paper.route_dropoff_key === null) return null;
  return { key: paper.route_dropoff_key, resolved: paper.route_dropoff_resolved === true, picks: paper.route_dropoff_picks ?? [] };
}

function toPairingCandidate(paper: DatedPaper): PairingCandidate {
  return { id: paper.id, plate: paper.vehicle_plate, times: readPairingTimes(paper.document_date, paper.precise_at), weightKg: readWeightKg(paper), receiverOrgIds: paper.receiver_org_ids, receiverKeys: paper.receiver_keys };
}

function toModelCandidate(paper: DatedPaper): ModelCandidate {
  return { id: paper.id, date: paper.document_date, preciseAt: paper.precise_at, receiver: paper.receiver_name ?? '', weightKg: readWeightKg(paper), kind: paper.kind };
}

function listModelRows(rows: PairingRow[], pickups: TripPaper[], candidates: PairingCandidate[], rulePairs: Map<string, string>): ModelRow[] {
  const byId = new Map(pickups.map((paper) => [paper.id, paper]));
  const taken = new Set(rulePairs.values());
  const byPlate = groupByPlate(candidates);
  return rows.flatMap((row) => {
    if (rulePairs.has(row.id)) return [];
    const candidateIds = (byPlate.get(row.plate) ?? []).filter((candidate) => !taken.has(candidate.id) && canPair(row, candidate)).map((candidate) => candidate.id);
    const paper = byId.get(row.id);
    if (candidateIds.length === 0 || paper === undefined) return [];
    return [{ id: row.id, plate: row.plate, date: row.date, preciseAt: row.preciseAt, pickup: readPickupPlace(paper) ?? '', weightKg: row.weightKg, candidateIds }];
  });
}

function logPairing(pairs: Map<string, PairedReceipt>, calls: ModelPairing[]): void {
  const byRule = [...pairs.values()].filter((pair) => pair.method === 'rule').length;
  console.log(`[trip-pairing] rule=${byRule} ai=${pairs.size - byRule} ai_calls=${calls.length}`);
  for (const call of calls) {
    if (call.kind === 'ran') console.log(`[trip-pairing] ai rows=${call.rows} candidates=${call.candidates} seconds=${call.seconds}`);
    if (call.kind === 'failed') console.log(`[trip-pairing] ai failed reason=${call.reason}`);
  }
}
