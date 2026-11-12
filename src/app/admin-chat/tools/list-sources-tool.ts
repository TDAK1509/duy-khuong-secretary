import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import { findRecordSources } from '../../records/find-record-sources.ts';
import type { RecordSource } from '../../records/record-source.ts';
import { formatVietnamDate } from '../../time/format-vietnam-date.ts';
import { formatVietnamTime } from '../../time/format-vietnam-time.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';

const argumentsSchema = z.object({ record_ids: z.array(z.string()) });
const uuidSchema = z.uuid();

type ListedSource = { card: number; source: RecordSource };

export async function runListSources(dependencies: AdminToolDependencies, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const found = await findRecordSources(dependencies.database, scope, args.record_ids.filter(isUuid));
  const listed = found.flatMap((source) => numberSource(dependencies, source));
  const listedRecordCount = listed.reduce((count, { source }) => count + source.recordIds.length, 0);
  return JSON.stringify({ sources: listed.map((listedSource) => describeSource(dependencies, listedSource)), left_out: new Set(args.record_ids).size - listedRecordCount });
}

function numberSource({ sources }: AdminToolDependencies, source: RecordSource): ListedSource[] {
  const card = sources.add(source);
  return card === null ? [] : [{ card, source }];
}

function describeSource({ sources }: AdminToolDependencies, { card, source }: ListedSource) {
  return {
    card,
    record_ids: source.recordIds,
    sender: source.isOwn ? 'Bạn' : source.sender,
    sent_at: `${formatVietnamTime(source.sentAt)} ${formatVietnamDate(source.sentAt)}`,
    kind: source.kind,
    paper_dates: source.paperDates,
    quoted: sources.isQuoted(source.messageId),
  };
}

function isUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}
