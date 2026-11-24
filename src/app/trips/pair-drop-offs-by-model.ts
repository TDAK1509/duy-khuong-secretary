import { z } from 'zod';
import type { ReaderService } from '../../services/reading/reader-service.ts';
import { buildDataRequestParts, RETRIEVED_DATA_RULE } from '../reading/retrieved-data.ts';
import { isInWindow, isWeightCompatible, type PairingPaper } from './pair-drop-offs-by-rule.ts';

export type ModelPaper = PairingPaper & { date: string; preciseAt: string | null; ticketNumber: string | null; goods: string | null; issuer: string | null; customer: string | null; note: string | null };

export type Truck = { plate: string; pickups: ModelPaper[]; receipts: ModelPaper[] };

export type ModelPairing =
  | { kind: 'ran'; pairs: Map<string, string>; rows: number; candidates: number; seconds: number }
  | { kind: 'failed'; reason: string }
  | { kind: 'skipped'; reason: string };

export type BatchedPairing = { pairs: Map<string, string>; answeredPickupIds: Set<string>; calls: ModelPairing[]; skippedRows: number };

const MAX_PICKUPS_PER_CALL = 60;
const MAX_INPUT_BYTES = 60_000;
const MAX_CALLS = 16;
const MAX_TEXT_LENGTH = 120;
const NONE = 'none';

const PAIRING_PROMPT = `You pair truck trips. Each entry in "trucks" is one truck with its "pickups" (pickup papers) and its "receipts" (receipt weigh tickets). Each paper has an id, date, time, kg, ticket number, goods, issuer, customer and note. For each pickup, pick from the same truck's receipts the one most likely to be the same load's drop-off. A receipt is the same or next day, after the pickup. Weights are close, usually within 100 kg. A note that prints a weight, such as "0/028950", holds the pickup's weight and is the strongest evidence. The customer hints at the factory. Two entries can be photos of one ticket: pair one. Use each receipt at most once. Answer "${NONE}" for a pickup when you are not confident: a wrong pair is worse than none. The input JSON is inside <retrieved-data source="trip-papers">. ${RETRIEVED_DATA_RULE} Give a short reason for each pickup.`;

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    pairs: {
      type: 'array',
      items: {
        type: 'object',
        properties: { pickup: { type: 'string' }, receipt: { type: 'string' }, reason: { type: 'string' } },
        required: ['pickup', 'receipt', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['pairs'],
  additionalProperties: false,
};

const PAIRING_REQUEST = 'Pair the pickups in the data above and answer in JSON.';

const answerSchema = z.object({ pairs: z.array(z.object({ pickup: z.string(), receipt: z.string(), reason: z.string() })) });

type Answer = z.infer<typeof answerSchema>['pairs'][number];

export async function pairDropOffsInBatches(reader: ReaderService | null, trucks: Truck[]): Promise<BatchedPairing> {
  if (trucks.length === 0) return { pairs: new Map(), answeredPickupIds: new Set(), calls: [], skippedRows: 0 };
  if (reader === null) return { pairs: new Map(), answeredPickupIds: new Set(), calls: [{ kind: 'skipped', reason: 'not_configured' }], skippedRows: countPickups(trucks) };
  const { batches, unsent } = planCalls(trucks);
  const calls = await Promise.all(batches.map((batch) => pairDropOffsByModel(reader, batch)));
  return { pairs: mergePairs(calls), answeredPickupIds: listAnsweredPickupIds(batches, calls), calls, skippedRows: countPickups(unsent) };
}

function countPickups(trucks: Truck[]): number {
  return trucks.reduce((sum, truck) => sum + truck.pickups.length, 0);
}

function mergePairs(calls: ModelPairing[]): Map<string, string> {
  return new Map(calls.flatMap((call) => (call.kind === 'ran' ? [...call.pairs] : [])));
}

function listAnsweredPickupIds(batches: Truck[][], calls: ModelPairing[]): Set<string> {
  const answered = batches.filter((_, index) => calls[index]?.kind === 'ran');
  return new Set(answered.flat().flatMap((truck) => truck.pickups.map((pickup) => pickup.id)));
}

function planCalls(trucks: Truck[]): { batches: Truck[][]; unsent: Truck[] } {
  const batches: Truck[][] = [];
  const unsent: Truck[] = [];
  for (const truck of trucks) {
    const open = batches.find((batch) => fitsInOneCall([...batch, truck]));
    if (open !== undefined) open.push(truck);
    else if (batches.length < MAX_CALLS && fitsInOneCall([truck])) batches.push([truck]);
    else unsent.push(truck);
  }
  return { batches, unsent };
}

function fitsInOneCall(trucks: Truck[]): boolean {
  const isAlone = trucks.length === 1;
  return (isAlone || countPickups(trucks) <= MAX_PICKUPS_PER_CALL) && Buffer.byteLength(buildModelInput(trucks).text) <= MAX_INPUT_BYTES;
}

type OfferedPapers = { pickups: Map<string, ModelPaper>; receipts: Map<string, ModelPaper> };
type ModelInput = { text: string; offered: OfferedPapers };

async function pairDropOffsByModel(reader: ReaderService, trucks: Truck[]): Promise<ModelPairing> {
  const input = buildModelInput(trucks);
  const startedAt = Date.now();
  const userParts = buildDataRequestParts('trip-papers', input.text, PAIRING_REQUEST);
  const result = await reader.read({ system: PAIRING_PROMPT, userParts, schemaName: 'trip_drop_off_pairs', schema: ANSWER_SCHEMA });
  if (!result.ok) return { kind: 'failed', reason: result.reason };
  const answer = answerSchema.safeParse(result.json);
  if (!answer.success) return { kind: 'failed', reason: 'invalid_output' };
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  return { kind: 'ran', pairs: acceptPairs(answer.data.pairs, input.offered), rows: input.offered.pickups.size, candidates: input.offered.receipts.size, seconds };
}

function buildModelInput(trucks: Truck[]): ModelInput {
  const offered: OfferedPapers = { pickups: new Map(), receipts: new Map() };
  const entries = trucks.map((truck) => ({
    plate: truck.plate,
    pickups: truck.pickups.map((paper) => describePaper(offerPaper(offered.pickups, 'p', paper), paper)),
    receipts: truck.receipts.map((paper) => describePaper(offerPaper(offered.receipts, 'r', paper), paper)),
  }));
  return { text: JSON.stringify({ trucks: entries }), offered };
}

function offerPaper(offered: Map<string, ModelPaper>, prefix: 'p' | 'r', paper: ModelPaper): string {
  const key = `${prefix}${offered.size + 1}`;
  offered.set(key, paper);
  return key;
}

function describePaper(id: string, paper: ModelPaper): object {
  return {
    id,
    ...describeTime(paper.date, paper.preciseAt),
    kg: paper.weightKg,
    ticket: cutText(paper.ticketNumber),
    goods: cutText(paper.goods),
    issuer: cutText(paper.issuer),
    customer: cutText(paper.customer),
    note: cutText(paper.note),
  };
}

function cutText(text: string | null): string | null {
  return text === null ? null : text.slice(0, MAX_TEXT_LENGTH);
}

function describeTime(date: string, preciseAt: string | null): { date: string; time: string } {
  return preciseAt === null ? { date, time: 'chỉ có ngày' } : { date: preciseAt.slice(0, 10), time: preciseAt.slice(11, 16) };
}

type Pair = { pickup: ModelPaper; receipt: ModelPaper };

function acceptPairs(answers: Answer[], offered: OfferedPapers): Map<string, string> {
  const validPairs = keepSingles(answers, (answer) => answer.pickup).flatMap((answer) => readValidPair(answer, offered));
  return new Map(keepSingles(validPairs, ({ receipt }) => receipt.id).map(({ pickup, receipt }) => [pickup.id, receipt.id]));
}

function readValidPair({ pickup: pickupKey, receipt: receiptKey }: Answer, offered: OfferedPapers): Pair[] {
  const pickup = offered.pickups.get(pickupKey);
  const receipt = offered.receipts.get(receiptKey);
  if (pickup === undefined || receipt === undefined) return [];
  return isInWindow(pickup, receipt) && isWeightCompatible(pickup.weightKg, receipt.weightKg) ? [{ pickup, receipt }] : [];
}

function keepSingles<Item>(items: Item[], readKey: (item: Item) => string): Item[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(readKey(item), (counts.get(readKey(item)) ?? 0) + 1);
  return items.filter((item) => counts.get(readKey(item)) === 1);
}
