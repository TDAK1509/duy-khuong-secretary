import { z } from 'zod';
import type { ReaderService } from '../../services/reading/reader-service.ts';
import { buildDataRequestParts, RETRIEVED_DATA_RULE } from '../reading/retrieved-data.ts';
import type { Receiver } from './list-receivers.ts';

export type DropOffName = { key: string; name: string };

export type DropOffMatch = DropOffName & { receiverIds: string[]; receiverNames: string[] };

export type DropOffMatching =
  | { kind: 'ran'; matches: DropOffMatch[] }
  | { kind: 'failed'; reason: string }
  | { kind: 'skipped' };

const MAX_INPUT_BYTES = 40_000;
const MAX_TEXT_LENGTH = 120;

const MATCHING_PROMPT = `You match drop-off names to receiving companies. Each entry in "drop_offs" is a drop-off name written in saved trip facts. Each entry in "receivers" is a receiving company printed on receipts, with its other spellings. For each drop-off name, answer the receivers it means, or none. A section, plant or branch of the named factory counts. A name "A or B" means both. The input JSON is inside <retrieved-data source="drop-off-names">. ${RETRIEVED_DATA_RULE}`;

const MATCHING_REQUEST = 'Match the drop-off names in the data above and answer in JSON.';

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    meanings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { drop_off: { type: 'string' }, receivers: { type: 'array', items: { type: 'string' } } },
        required: ['drop_off', 'receivers'],
        additionalProperties: false,
      },
    },
  },
  required: ['meanings'],
  additionalProperties: false,
};

const answerSchema = z.object({ meanings: z.array(z.object({ drop_off: z.string(), receivers: z.array(z.string()) })) });

type Answer = z.infer<typeof answerSchema>['meanings'][number];

type OfferedNames = { dropOffs: Map<string, DropOffName>; receivers: Map<string, Receiver> };
type ModelInput = { text: string; offered: OfferedNames };

export async function matchDropOffNames(reader: ReaderService | null, names: DropOffName[], receivers: Receiver[]): Promise<DropOffMatching> {
  if (names.length === 0 || receivers.length === 0) return { kind: 'skipped' };
  if (reader === null) return { kind: 'failed', reason: 'not_configured' };
  const input = buildModelInput(names, receivers);
  if (Buffer.byteLength(input.text) > MAX_INPUT_BYTES) return { kind: 'failed', reason: 'input_too_large' };
  return askReader(reader, input);
}

async function askReader(reader: ReaderService, { text, offered }: ModelInput): Promise<DropOffMatching> {
  const userParts = buildDataRequestParts('drop-off-names', text, MATCHING_REQUEST);
  const result = await reader.read({ system: MATCHING_PROMPT, userParts, schemaName: 'trip_drop_off_meanings', schema: ANSWER_SCHEMA });
  if (!result.ok) return { kind: 'failed', reason: result.reason };
  const answer = answerSchema.safeParse(result.json);
  if (!answer.success) return { kind: 'failed', reason: 'invalid_output' };
  return { kind: 'ran', matches: acceptMeanings(answer.data.meanings, offered) };
}

function buildModelInput(names: DropOffName[], receivers: Receiver[]): ModelInput {
  const offered: OfferedNames = {
    dropOffs: new Map(names.map((name, index) => [`d${index + 1}`, name])),
    receivers: new Map(receivers.map((receiver, index) => [`r${index + 1}`, receiver])),
  };
  const dropOffs = [...offered.dropOffs].map(([id, { name }]) => ({ id, name: cutText(name) }));
  const entries = [...offered.receivers].map(([id, { name, aliases }]) => ({ id, name: cutText(name), aliases: aliases.map(cutText) }));
  return { text: JSON.stringify({ drop_offs: dropOffs, receivers: entries }), offered };
}

function cutText(text: string): string {
  return text.slice(0, MAX_TEXT_LENGTH);
}

function acceptMeanings(answers: Answer[], offered: OfferedNames): DropOffMatch[] {
  const answeredReceivers = new Map(answers.map(({ drop_off: dropOff, receivers }) => [dropOff, receivers]));
  return [...offered.dropOffs].map(([id, name]) => describeMatch(name, listOfferedReceivers(answeredReceivers.get(id) ?? [], offered)));
}

function listOfferedReceivers(receiverKeys: string[], offered: OfferedNames): Receiver[] {
  return [...new Set(receiverKeys)].flatMap((key) => offered.receivers.get(key) ?? []);
}

function describeMatch(name: DropOffName, receivers: Receiver[]): DropOffMatch {
  return { ...name, receiverIds: receivers.map((receiver) => receiver.id), receiverNames: receivers.map((receiver) => receiver.name) };
}
