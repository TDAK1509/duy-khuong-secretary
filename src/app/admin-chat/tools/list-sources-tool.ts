import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import { findDocumentSources } from '../../documents/find-document-sources.ts';
import { findRecordSources } from '../../records/find-record-sources.ts';
import { mergeSourcesByMessage } from '../../records/merge-sources.ts';
import type { RecordSource } from '../../records/record-source.ts';
import { formatVietnamDate } from '../../time/format-vietnam-date.ts';
import { formatVietnamTime } from '../../time/format-vietnam-time.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';

const MAX_SOURCES_PER_CALL = 5;

const argumentsSchema = z.object({ record_ids: z.array(z.string()), document_ids: z.array(z.string()).default([]) });
const uuidSchema = z.uuid();

type ListedSource = { card: number; source: RecordSource };

export async function runListSources(dependencies: AdminToolDependencies, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const recordSources = await findRecordSources(dependencies.database, scope, args.record_ids.filter(isUuid));
  const documentSources = await findDocumentSources(dependencies.database, scope, args.document_ids.filter(isUuid));
  const visible = mergeSourcesByMessage([...recordSources, ...documentSources.sources]);
  const listed = visible.slice(0, MAX_SOURCES_PER_CALL).flatMap((source) => numberSource(dependencies, source));
  const foundIdCount = new Set(recordSources.flatMap((source) => source.recordIds)).size + documentSources.foundDocumentIds.length;
  const requestedIdCount = new Set(args.record_ids).size + new Set(args.document_ids).size;
  return JSON.stringify({
    sources: listed.map((listedSource) => describeSource(dependencies, listedSource)),
    left_out: requestedIdCount - foundIdCount,
    sources_left_out: visible.length - listed.length,
  });
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
