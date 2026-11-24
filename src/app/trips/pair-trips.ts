import type { ReaderService } from '../../services/reading/reader-service.ts';
import type { TripPaper } from './list-trip-papers.ts';
import { pairDropOffsInBatches, type BatchedPairing, type ModelPaper, type ModelPairing, type Truck } from './pair-drop-offs-by-model.ts';
import { groupByPlate, pairDropOffsByRule, readPairingTimes, type PairingPaper, type PairingRow } from './pair-drop-offs-by-rule.ts';
import { groupPossibleDuplicates, readWeightKg } from './read-trip-paper.ts';

export type PairMethod = 'rule' | 'ai';

export type PairedReceipt = { receiptId: string; method: PairMethod };

export type TripPairing = { pairs: Map<string, PairedReceipt>; modelCalls: ModelPairing[]; modelSkippedRows: number };

export type PairingPapers = { pickups: TripPaper[]; receipts: TripPaper[] };

type DatedPaper = TripPaper & { vehicle_plate: string; document_date: string };

export async function pairTrips(reader: ReaderService | null, { pickups, receipts }: PairingPapers): Promise<TripPairing> {
  const duplicateIds = new Set(groupPossibleDuplicates(pickups).flat().map((paper) => paper.id));
  const datedPickups = pickups.filter(isDated);
  const datedReceipts = receipts.filter(isDated);
  const rule = pairDropOffsByRule(datedPickups.map((paper) => toPairingRow(paper, duplicateIds)), datedReceipts.map(toPairingPaper));
  const model = await pairDropOffsInBatches(reader, listTrucksWithReceipts(datedPickups, datedReceipts));
  const pairs = choosePairs(rule.pairs, model);
  logPairing(pairs, model.calls);
  return { pairs, modelCalls: model.calls, modelSkippedRows: model.skippedRows };
}

function isDated(paper: TripPaper): paper is DatedPaper {
  return paper.vehicle_plate !== null && paper.document_date !== null;
}

function toPairingRow(paper: DatedPaper, duplicateIds: Set<string>): PairingRow {
  return { ...toPairingPaper(paper), isPossibleDuplicate: duplicateIds.has(paper.id) };
}

function listTrucksWithReceipts(pickups: DatedPaper[], receipts: DatedPaper[]): Truck[] {
  const receiptsByPlate = groupByPlate(receipts.map(toModelPaper));
  const trucks = [...groupByPlate(pickups.map(toModelPaper))].map(([plate, truckPickups]) => ({ plate, pickups: truckPickups, receipts: receiptsByPlate.get(plate) ?? [] }));
  return trucks.filter((truck) => truck.receipts.length > 0);
}

function toModelPaper(paper: DatedPaper): ModelPaper {
  return {
    ...toPairingPaper(paper),
    date: paper.document_date,
    preciseAt: paper.precise_at,
    ticketNumber: paper.document_number,
    goods: paper.goods_line,
    issuer: paper.issuer_name,
    customer: paper.customer_party,
    note: paper.note_line,
  };
}

function toPairingPaper(paper: DatedPaper): PairingPaper {
  return { id: paper.id, plate: paper.vehicle_plate, times: readPairingTimes(paper.document_date, paper.precise_at), weightKg: readWeightKg(paper) };
}

function choosePairs(rulePairs: Map<string, string>, model: BatchedPairing): Map<string, PairedReceipt> {
  const pairs = new Map<string, PairedReceipt>();
  for (const [pickupId, receiptId] of rulePairs) {
    if (!model.answeredPickupIds.has(pickupId)) pairs.set(pickupId, { receiptId, method: 'rule' });
  }
  for (const [pickupId, receiptId] of model.pairs) {
    pairs.set(pickupId, { receiptId, method: rulePairs.get(pickupId) === receiptId ? 'rule' : 'ai' });
  }
  return pairs;
}

function logPairing(pairs: Map<string, PairedReceipt>, calls: ModelPairing[]): void {
  const byRule = [...pairs.values()].filter((pair) => pair.method === 'rule').length;
  console.log(`[trip-pairing] rule=${byRule} ai=${pairs.size - byRule} ai_calls=${calls.length}`);
  for (const call of calls) {
    if (call.kind === 'ran') console.log(`[trip-pairing] ai rows=${call.rows} candidates=${call.candidates} seconds=${call.seconds}`);
    if (call.kind === 'failed') console.log(`[trip-pairing] ai failed reason=${call.reason}`);
  }
}
