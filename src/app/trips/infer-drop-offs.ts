import type { ReaderService } from '../../services/reading/reader-service.ts';
import type { Database } from '../db/transaction.ts';
import { groupPossibleDuplicates } from './build-trip-report.ts';
import { listDropOffCandidates, type DropOffCandidate } from './list-drop-off-candidates.ts';
import type { TripPaper } from './list-trip-papers.ts';
import { pairDropOffsByModel, type ModelPairing, type ModelRow } from './pair-drop-offs-by-model.ts';
import { groupByPlate, isInWindow, pairDropOffsByRule, readPairingTimes, type PairingCandidate, type PairingRow } from './pair-drop-offs-by-rule.ts';

export type InferredDropOff = { dropOff: string; method: 'rule' | 'ai'; receiptNumber: string | null };

export type DropOffInference = { inferred: Map<string, InferredDropOff>; eligible: number; stillUnknown: number; model: ModelPairing };

export type DropOffRequest = { workspaceId: string; dateFrom: string; dateTo: string; papers: TripPaper[] };

type DatedPaper = TripPaper & { vehicle_plate: string; document_date: string };

export async function inferDropOffs(database: Database, reader: ReaderService | null, request: DropOffRequest): Promise<DropOffInference> {
  const rows = listPairingRows(request.papers);
  const eligible = request.papers.filter((paper) => readPairingRole(paper) === 'eligible').length;
  const candidates = await listDropOffCandidates(database, {
    workspaceId: request.workspaceId,
    plates: [...new Set(rows.map((row) => row.plate))],
    dateFrom: request.dateFrom,
    dateTo: request.dateTo,
    reportPaperIds: request.papers.map((paper) => paper.id),
  });
  const pairingCandidates = candidates.map(toPairingCandidate);
  const rule = pairDropOffsByRule(rows, pairingCandidates);
  const model = await pairDropOffsByModel(reader, listModelRows(rows, pairingCandidates, rule, request.papers), candidates.map(toModelCandidate));
  const inference = collectInference(eligible, candidates, rule.pairs, model);
  logInference(inference);
  return inference;
}

function listPairingRows(papers: TripPaper[]): PairingRow[] {
  const duplicateIds = new Set(groupPossibleDuplicates(papers).flat().map((paper) => paper.id));
  return papers.filter(isDated).flatMap((paper) => {
    const role = readPairingRole(paper);
    if (role === null) return [];
    return [{ id: paper.id, plate: paper.vehicle_plate, date: paper.document_date, preciseAt: paper.precise_at, times: readPairingTimes(paper.document_date, paper.precise_at), weightKg: readWeight(paper.weight_kg), isEligible: role === 'eligible', isPossibleDuplicate: duplicateIds.has(paper.id) }];
  });
}

function isDated(paper: TripPaper): paper is DatedPaper {
  return paper.vehicle_plate !== null && paper.document_date !== null;
}

function readPairingRole(paper: TripPaper): 'eligible' | 'reserving' | null {
  const hasRouteFact = paper.route_pickup !== null || paper.route_dropoff !== null;
  if (!hasRouteFact) return paper.issuer_name === null ? null : 'eligible';
  if (paper.route_pickup === null) return null;
  return paper.route_dropoff === null ? 'eligible' : 'reserving';
}

function readWeight(weightKg: string | null): number | null {
  return weightKg === null ? null : Number(weightKg);
}

function toPairingCandidate(candidate: DropOffCandidate): PairingCandidate {
  return { id: candidate.id, plate: candidate.vehicle_plate, times: readPairingTimes(candidate.document_date, candidate.precise_at), weightKg: readWeight(candidate.weight_kg) };
}

function toModelCandidate(candidate: DropOffCandidate) {
  return { id: candidate.id, date: candidate.document_date, preciseAt: candidate.precise_at, receiver: candidate.receiver, weightKg: readWeight(candidate.weight_kg), kind: candidate.kind };
}

function listModelRows(rows: PairingRow[], candidates: PairingCandidate[], rule: { pairs: Map<string, string>; taken: Set<string> }, papers: TripPaper[]): ModelRow[] {
  const pickups = new Map(papers.map((paper) => [paper.id, paper.route_pickup ?? paper.issuer_name ?? '']));
  const byPlate = groupByPlate(candidates);
  return rows.flatMap((row) => {
    if (!row.isEligible || rule.pairs.has(row.id)) return [];
    const candidateIds = (byPlate.get(row.plate) ?? []).filter((candidate) => !rule.taken.has(candidate.id) && isInWindow(row, candidate)).map((candidate) => candidate.id);
    return candidateIds.length === 0 ? [] : [{ ...row, pickup: pickups.get(row.id) ?? '', candidateIds }];
  });
}

function collectInference(eligible: number, candidates: DropOffCandidate[], rulePairs: Map<string, string>, model: ModelPairing): DropOffInference {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const inferred = new Map<string, InferredDropOff>();
  const addPair = (rowId: string, candidateId: string, method: InferredDropOff['method']) => {
    const candidate = byId.get(candidateId);
    if (candidate !== undefined) inferred.set(rowId, { dropOff: candidate.receiver, method, receiptNumber: candidate.document_number });
  };
  for (const [rowId, candidateId] of rulePairs) addPair(rowId, candidateId, 'rule');
  if (model.kind === 'ran') for (const [rowId, candidateId] of model.pairs) addPair(rowId, candidateId, 'ai');
  return { inferred, eligible, stillUnknown: eligible - inferred.size, model };
}

function logInference({ inferred, eligible, stillUnknown, model }: DropOffInference): void {
  const byRule = [...inferred.values()].filter((pair) => pair.method === 'rule').length;
  console.log(`[trip-dropoff] eligible=${eligible} rule=${byRule} ai=${inferred.size - byRule} unknown=${stillUnknown}`);
  if (model.kind === 'ran') console.log(`[trip-dropoff] ai rows=${model.rows} candidates=${model.candidates} seconds=${model.seconds}`);
  if (model.kind === 'failed') console.log(`[trip-dropoff] ai failed reason=${model.reason}`);
}
